import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  parseCsv,
  parseXlsx,
  parsePdf,
  cents,
  parseDate,
  ParseError,
} from "../lib/parsing";
import {
  classify,
  calculatePnl,
  detectDuplicates,
  detectTransfers,
  setCategory,
  sampleReport,
  needsReview,
  type Transaction,
} from "../lib/domain";
import { pdfExport, xlsxExport, csvExport } from "../lib/export";
import { verifyStripeSignature } from "../lib/stripe-signature";
const tx = (description: string, amount: string, date = "2026-01-01") =>
  parseCsv(
    `Date,Description,Amount\n${date},${description},${amount}`,
    "s1",
  )[0];
const pnl = (ts: Transaction[]) => calculatePnl(ts, "2026-01-01", "2026-12-31");
const arrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
test("parses cents exactly and rejects malformed amounts", () => {
  assert.equal(cents("1,234.56"), 123456);
  assert.equal(cents("(42.19)"), -4219);
  assert.equal(cents("12.04 DR"), -1204);
  assert.equal(cents("0.10"), 10);
  for (const v of ["x", "1.001", "1e6", "1.2.3", "1-2"])
    assert.throws(() => cents(v), ParseError);
});
test("validates US and ISO dates without rolling invalid dates", () => {
  assert.equal(parseDate("02/28/2026"), "2026-02-28");
  assert.equal(parseDate("1/1/26"), "2026-01-01");
  assert.throws(() => parseDate("02/30/2026"));
  assert.throws(() => parseDate("13/01/2026"));
});
test("CSV detects separate debit/credit columns and quoted merchant commas", () => {
  const ts = parseCsv(
    'Posted Date,Description,Debit,Credit\n01/01/2026,"Acme, Inc",,1200.42\n01/02/2026,Software,42.31,',
    "s",
  );
  assert.equal(ts[0].amount, 120042);
  assert.equal(ts[1].direction, "debit");
});
test("ambiguous columns require mapping; explicit convention supports positive withdrawals", () => {
  assert.throws(
    () => parseCsv("When,Who,Value\n01/01/2026,Shop,20", "s"),
    (e: unknown) => e instanceof ParseError && e.headers?.[0] === "When",
  );
  const ts = parseCsv("When,Who,Value\n01/01/2026,Shop,20", "s", {
    date: "When",
    description: "Who",
    amount: "Value",
    convention: "debit-positive",
  });
  assert.equal(ts[0].direction, "debit");
});
test("malformed rows fail the whole file and identify row number", () => {
  assert.throws(
    () =>
      parseCsv(
        "Date,Description,Amount\n01/01/2026,Valid,10\nnot-a-date,Broken,xyz",
        "s",
      ),
    /Row 3/,
  );
  assert.throws(
    () =>
      parseCsv("Date,Description,Amount,Currency\n01/01/2026,Test,10,EUR", "s"),
    /Only USD/,
  );
});
test("deterministic P&L computes revenue, COGS, operating profit and interest", () => {
  const result = pnl([
    setCategory(tx("Client", "1000.10"), "sales"),
    setCategory(tx("Materials", "-100.01"), "materials"),
    setCategory(tx("Software", "-50.03"), "software"),
    setCategory(tx("Interest", "-10.01"), "interest"),
  ]);
  assert.equal(result.revenue, 100010);
  assert.equal(result.grossProfit, 90009);
  assert.equal(result.operatingProfit, 85006);
  assert.equal(result.netProfit, 84005);
  assert.equal(result.totalExpenses, 16005);
});
test("credit expense refunds and debit revenue refunds offset original categories", () => {
  const result = pnl([
    setCategory(tx("Sale", "100"), "sales"),
    setCategory(tx("Customer refund", "-20"), "sales"),
    setCategory(tx("Software", "-50"), "software"),
    setCategory(tx("Software refund", "10"), "software"),
  ]);
  assert.equal(result.revenue, 8000);
  assert.equal(result.opex, 4000);
  assert.equal(result.netProfit, 4000);
});
test("loan proceeds, principal, owners and transfers excluded; no invented interest", () => {
  const ts = [
    "Loan deposit",
    "Owner contribution",
    "Transfer from savings",
  ].map((s) => classify(tx(s, "10000")));
  const repayment = classify(tx("Loan payment", "-250"));
  assert.equal(repayment.categoryId, "loan-principal");
  assert.equal(needsReview(repayment), true);
  assert.equal(pnl([...ts, repayment]).netProfit, 0);
  assert.equal(pnl(ts).netMargin, null);
});
test("zero revenue, zero expenses, losses and period filtering", () => {
  assert.equal(pnl([]).netMargin, null);
  assert.equal(pnl([setCategory(tx("Client", "100"), "sales")]).netMargin, 1);
  assert.equal(
    pnl([setCategory(tx("Expense", "-100"), "office")]).netProfit,
    -10000,
  );
  assert.equal(
    pnl([setCategory(tx("Future", "100", "2027-01-01"), "sales")]).revenue,
    0,
  );
});
test("large unidentified credits must be reviewed", () => {
  const t = classify(tx("ACH ACME", "15000"));
  assert.equal(t.categoryId, "unknown");
  assert.equal(needsReview(t), true);
});
test("possible duplicates within or across statements are flagged, not silently excluded", () => {
  const t = tx("Supplier", "-100");
  const duplicate = { ...t, id: "second", statementId: "s2" };
  const result = detectDuplicates([t, duplicate], []);
  assert.equal(result[1].duplicateOf, t.id);
  assert.equal(result[1].isDuplicate, false);
  const sameStatement = detectDuplicates([t, { ...t, id: "third" }], []);
  assert.equal(sameStatement[1].duplicateOf, t.id);
  assert.equal(sameStatement[1].isDuplicate, false);
});
test("distinct known accounts prevent false duplicate matching", () => {
  const t = tx("Software", "-10");
  const statements = [
    { id: "s1", account: "checking" },
    { id: "s2", account: "savings" },
  ] as Parameters<typeof detectDuplicates>[1];
  assert.equal(
    detectDuplicates([t, { ...t, id: "two", statementId: "s2" }], statements)[1]
      .duplicateOf,
    undefined,
  );
});
test("transfer matching needs distinct accounts, opposite amount, and descriptions", () => {
  const a = tx("Transfer to savings", "-200"),
    b = {
      ...tx("Transfer from checking", "200", "2026-01-02"),
      id: "b",
      statementId: "s2",
    };
  const statements = [
    { id: "s1", account: "checking" },
    { id: "s2", account: "savings" },
  ] as Parameters<typeof detectTransfers>[1];
  const ts = detectTransfers([a, b], statements);
  assert.ok(ts.every((t) => t.isTransfer && t.confidence > 0.9));
  assert.equal(
    detectTransfers(
      [a, { ...b, rawDescription: "Client payment" }],
      statements,
    )[0].isTransfer,
    false,
  );
});
test("exports share exact deterministic sample totals and safe CSV strings", async () => {
  const report = sampleReport(),
    result = pnl(report.transactions);
  assert.equal(result.revenue, 4825000);
  assert.equal(result.netProfit, 2917000);
  const pdf = await pdfExport(report);
  assert.equal(new TextDecoder().decode(pdf.slice(0, 5)), "%PDF-");
  const bytes = await xlsxExport(report);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  assert.equal(wb.worksheets.length, 2);
  let net = 0;
  wb.getWorksheet("P&L")!.eachRow((row) => {
    if (row.getCell(1).value === "Net Profit")
      net = Number(row.getCell(2).value);
  });
  assert.equal(net, 29170);
  report.transactions[0].rawDescription = '=HYPERLINK("https://example.com")';
  assert.match(csvExport(report), /'=HYPERLINK/);
});
test("reads actual XLSX dates and amounts", async () => {
  const wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("Transactions");
  sheet.addRow(["Date", "Description", "Amount"]);
  sheet.addRow([new Date("2026-01-01T00:00:00Z"), "Client payment", 123.45]);
  const buffer = await wb.xlsx.writeBuffer();
  const rows = await parseXlsx(
    Uint8Array.from(new Uint8Array(buffer)).buffer,
    "xlsx",
  );
  assert.equal(rows[0].amount, 12345);
  assert.equal(rows[0].date, "2026-01-01");
});
test("reads namespace-prefixed XLSX and preserves every source row", async () => {
  const bytes = await readFile(
    resolve("tests/fixtures/02_February_Statement.xlsx"),
  );
  const rows = await parseXlsx(arrayBuffer(bytes), "february-xlsx");
  const metaAds = rows.filter((row) => row.rawDescription === "META ADS 77841");
  assert.equal(rows.length, 19);
  assert.equal(metaAds.length, 2);
  assert.deepEqual(
    metaAds.map(({ date, amount, direction }) => ({ date, amount, direction })),
    [
      { date: "2026-02-09", amount: 72000, direction: "debit" },
      { date: "2026-02-09", amount: 72000, direction: "debit" },
    ],
  );
});
test("reports corrupted, encrypted, unsupported, and generic XLSX failures separately", async () => {
  await assert.rejects(
    () => parseXlsx(arrayBuffer(new TextEncoder().encode("not a zip")), "bad"),
    /corrupted or incomplete/,
  );

  const compoundHeader = Uint8Array.from([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
  ]);
  const encryptedPackage = Uint8Array.from(
    [..."EncryptedPackage"].flatMap((character) => [
      character.charCodeAt(0),
      0,
    ]),
  );
  const encrypted = new Uint8Array(
    compoundHeader.length + encryptedPackage.length,
  );
  encrypted.set(compoundHeader);
  encrypted.set(encryptedPackage, compoundHeader.length);
  await assert.rejects(
    () => parseXlsx(arrayBuffer(encrypted), "encrypted"),
    /encrypted or password-protected/,
  );
  await assert.rejects(
    () => parseXlsx(arrayBuffer(compoundHeader), "legacy"),
    /unsupported Excel format or feature/,
  );

  const workbook = new ExcelJS.Workbook();
  workbook
    .addWorksheet("Transactions")
    .addRow(["Date", "Description", "Amount"]);
  const valid = await workbook.xlsx.writeBuffer();
  const zip = await JSZip.loadAsync(new Uint8Array(valid));
  zip.file(
    "xl/workbook.xml",
    '<?xml version="1.0"?><x:workbook xmlns:x="urn:unknown"><x:sheets /></x:workbook>',
  );
  const unexpected = await zip.generateAsync({ type: "uint8array" });
  await assert.rejects(
    () => parseXlsx(arrayBuffer(unexpected), "unexpected"),
    (error: unknown) =>
      error instanceof ParseError &&
      /couldn’t parse this workbook reliably/.test(error.message) &&
      !/password/i.test(error.message),
  );
});
test("reads signed PDF transaction rows; rejects scanned and broken PDFs", async () => {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("01/01/2026 Client payment +1,200.00", {
    x: 40,
    y: 700,
    font,
    size: 12,
  });
  page.drawText("01/02/2026 Adobe subscription -25.50", {
    x: 40,
    y: 675,
    font,
    size: 12,
  });
  const bytes = await pdf.save();
  const rows = await parsePdf(Uint8Array.from(bytes).buffer, "pdf");
  assert.equal(rows.length, 2);
  assert.equal(rows[1].amount, 2550);
  const ambiguous = await PDFDocument.create(),
    ambiguousPage = ambiguous.addPage(),
    ambiguousFont = await ambiguous.embedFont(StandardFonts.Helvetica);
  ambiguousPage.drawText("01/03/2026 Ambiguous amount 25.50", {
    x: 40,
    y: 700,
    font: ambiguousFont,
    size: 12,
  });
  await assert.rejects(
    async () =>
      parsePdf(Uint8Array.from(await ambiguous.save()).buffer, "unsigned-pdf"),
    /unsigned PDF amounts are not supported/,
  );
  const scanned = await PDFDocument.create();
  scanned.addPage();
  await assert.rejects(
    () =>
      parsePdf(
        Uint8Array.from(new TextEncoder().encode("%PDF-broken")).buffer,
        "s",
      ),
    ParseError,
  );
  await assert.rejects(
    async () => parsePdf(Uint8Array.from(await scanned.save()).buffer, "scan"),
    /couldn’t reliably/,
  );
});
test("reads every transaction from a text PDF with Debit and Credit columns", async () => {
  const bytes = await readFile(
    resolve("tests/fixtures/03_March_Statement.pdf"),
  );
  const rows = await parsePdf(arrayBuffer(bytes), "march-pdf");
  assert.deepEqual(
    rows.map(({ date, rawDescription, amount, direction }) => ({
      date,
      rawDescription,
      amount,
      direction,
    })),
    [
      ["03/02/2026", "STRIPE PAYOUT ST-0302", 1010000, "credit"],
      ["03/04/2026", "ACH CREDIT CLIENT C INV-1134", 420000, "credit"],
      ["03/05/2026", "HOME DEPOT #0412", 198000, "debit"],
      ["03/06/2026", "ABC PLUMBING SUPPLY", 92000, "debit"],
      ["03/07/2026", "MILLER HVAC LLC", 140000, "debit"],
      ["03/09/2026", "GOOGLE ADS 991404", 80000, "debit"],
      ["03/10/2026", "CANVA PRO", 1500, "debit"],
      ["03/10/2026", "MICROSOFT 365", 2200, "debit"],
      ["03/12/2026", "ACH OFFICE RENT MAR", 180000, "debit"],
      ["03/15/2026", "GUSTO PAYROLL", 280000, "debit"],
      ["03/16/2026", "CITY ELECTRIC UTILITY", 23000, "debit"],
      ["03/17/2026", "STATE FARM BUSINESS", 21000, "debit"],
      ["03/18/2026", "SHELL OIL 5743", 24000, "debit"],
      ["03/19/2026", "THE LOCAL KITCHEN", 15500, "debit"],
      ["03/20/2026", "STRIPE PROCESSING FEE", 30300, "debit"],
      ["03/21/2026", "OWNER DRAW", 150000, "debit"],
      ["03/22/2026", "APPLE STORE R042", 89900, "debit"],
      ["03/23/2026", "TRANSFER TO BUSINESS SAVINGS 2711", 250000, "debit"],
      ["03/24/2026", "PAYPAL *J SMITH", 95000, "debit"],
      ["03/25/2026", "COUNTY BUSINESS LICENSE", 20000, "debit"],
      ["03/27/2026", "HOME DEPOT RETURN", 18000, "credit"],
    ].map(([date, rawDescription, amount, direction]) => ({
      date: parseDate(date),
      rawDescription,
      amount,
      direction,
    })),
  );
});
test("Stripe signatures require exact payload and fresh timestamp", async () => {
  const secret = "whsec_local_test",
    payload = '{"type":"checkout.session.completed"}',
    time = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Buffer.from(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${time}.${payload}`),
    ),
  ).toString("hex");
  assert.equal(
    await verifyStripeSignature(payload, `t=${time},v1=${signature}`, secret),
    true,
  );
  assert.equal(
    await verifyStripeSignature(
      payload + " ",
      `t=${time},v1=${signature}`,
      secret,
    ),
    false,
  );
  assert.equal(
    await verifyStripeSignature(
      payload,
      `t=${time},v1=${signature}`,
      secret,
      (time + 301) * 1000,
    ),
    false,
  );
});
