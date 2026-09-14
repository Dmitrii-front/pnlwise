import Papa from "papaparse";
import { validDate, normalizeMerchant, type Transaction } from "./domain";
export class ParseError extends Error {
  constructor(
    message: string,
    public headers?: string[],
  ) {
    super(message);
  }
}
export type Mapping = Partial<
  Record<
    | "date"
    | "description"
    | "amount"
    | "debit"
    | "credit"
    | "currency"
    | "convention",
    string
  >
>;
const aliases: Record<string, string[]> = {
  date: ["date", "transactiondate", "posteddate", "postingdate", "postdate"],
  description: [
    "description",
    "memo",
    "details",
    "transactiondescription",
    "payee",
    "merchant",
    "name",
  ],
  amount: ["amount", "transactionamount", "signedamount"],
  debit: [
    "debit",
    "debits",
    "withdrawal",
    "withdrawals",
    "withdrawalsdebits",
    "moneyout",
  ],
  credit: [
    "credit",
    "credits",
    "deposit",
    "deposits",
    "depositscredits",
    "moneyin",
  ],
  currency: ["currency", "currencycode"],
};
export function cents(input: unknown): number {
  let s = String(input ?? "").trim();
  if (!s) throw new ParseError("An amount is missing.");
  s = s.replace(/^USD\s*|\s*USD$/gi, "");
  if (
    !/^(?:[+-]?\s*\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?(?:\s*(?:CR|DR))?|\(\s*\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*\))$/i.test(
      s,
    )
  )
    throw new ParseError("Invalid amount formatting.");
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-") || /DR$/i.test(s);
  s = s.replace(/(?:USD|\$|,|\(|\)|\+|-|\s|CR$|DR$)/gi, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    throw new ParseError(
      "An amount is invalid. Use USD values with at most two decimal places.",
    );
  const [whole, fraction = ""] = s.split(".");
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 100000000000)
    throw new ParseError("An amount exceeds the supported range.");
  return negative ? -n : n;
}
export function parseDate(v: unknown) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  if (validDate(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (m) {
    const year =
      m[3].length === 2 ? `${Number(m[3]) < 70 ? "20" : "19"}${m[3]}` : m[3];
    const iso = `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    if (validDate(iso)) return iso;
  }
  throw new ParseError("Use a valid date, such as 01/31/2026 or 2026-01-31.");
}
function detect(headers: string[], mapping?: Mapping): Mapping {
  const result: Mapping = {};
  for (const key of Object.keys(aliases)) {
    const matches = headers.filter((h) =>
      aliases[key].includes(h.toLowerCase().replace(/[^a-z]/g, "")),
    );
    if (matches.length === 1) result[key as keyof Mapping] = matches[0];
  }
  if (mapping) {
    for (const [k, v] of Object.entries(mapping)) {
      if (k === "convention") {
        if (!["credit-positive", "debit-positive"].includes(v || ""))
          throw new ParseError("Choose a valid amount convention.");
        result.convention = v;
        continue;
      }
      if (!Object.keys(aliases).includes(k))
        throw new ParseError("Unknown column mapping.");
      if (v && !headers.includes(v))
        throw new ParseError("Choose a column from this statement.");
      result[k as keyof Mapping] = v || undefined;
    }
  }
  if (
    !result.date ||
    !result.description ||
    !(result.amount || result.debit || result.credit)
  )
    throw new ParseError(
      "Match the columns in this statement to continue.",
      headers,
    );
  const keys = [
    result.date,
    result.description,
    result.amount,
    result.debit,
    result.credit,
    result.currency,
  ].filter(Boolean);
  if (new Set(keys).size !== keys.length)
    throw new ParseError("Each field must use a different column.", headers);
  return result;
}
export function parseRows(
  rows: unknown[][],
  statementId: string,
  mapping?: Mapping,
): Transaction[] {
  rows = rows.filter((r) =>
    r.some((v) => v !== "" && v !== null && v !== undefined),
  );
  if (rows.length < 2)
    throw new ParseError(
      "No transactions found. Upload a statement with a header row and transactions.",
    );
  if (rows.length > 5001)
    throw new ParseError(
      "This statement has more than 5,000 rows. Split it into smaller files.",
    );
  const headerIndex = rows.slice(0, 20).findIndex((r) =>
    r.some((h) =>
      aliases.date.includes(
        String(h)
          .toLowerCase()
          .replace(/[^a-z]/g, ""),
      ),
    ),
  );
  if (headerIndex > 0) rows = rows.slice(headerIndex);
  const headers = rows[0].map((v) => String(v ?? "").trim());
  if (headers.length > 50)
    throw new ParseError(
      "Too many columns. Export a transaction-only CSV from your bank.",
    );
  if (new Set(headers).size !== headers.length || headers.some((x) => !x))
    throw new ParseError(
      "Column headings must be unique and nonempty. Update the file and upload it again.",
    );
  const m = detect(headers, mapping);
  const get = (r: unknown[], key: keyof Mapping) =>
    m[key] ? r[headers.indexOf(m[key]!)] : undefined;
  const result: Transaction[] = [];
  const errors: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    try {
      if (r.length > headers.length)
        throw new ParseError("More values than column headings.");
      const date = parseDate(get(r, "date"));
      const rawDescription = String(get(r, "description") ?? "").trim();
      if (!rawDescription || rawDescription.length > 500)
        throw new ParseError("Description must contain 1–500 characters.");
      const currency =
        String(get(r, "currency") ?? "USD")
          .trim()
          .toUpperCase() || "USD";
      if (currency !== "USD")
        throw new ParseError(
          "Only USD is supported. Upload USD accounts in a separate report.",
        );
      let signed: number;
      if (m.debit || m.credit) {
        const debit = String(get(r, "debit") ?? "").trim(),
          credit = String(get(r, "credit") ?? "").trim();
        const d = debit ? cents(debit) : 0,
          c = credit ? cents(credit) : 0;
        if (d && c)
          throw new ParseError(
            "Both debit and credit are filled. Choose one amount column instead.",
          );
        if (!debit && !credit)
          throw new ParseError("Both debit and credit are empty.");
        signed = c - d;
      } else {
        signed = cents(get(r, "amount"));
        if (m.convention === "debit-positive") signed = -signed;
      }
      if (signed === 0)
        throw new ParseError(
          "Zero-amount row. Remove non-transaction rows before uploading.",
        );
      result.push({
        id: crypto.randomUUID(),
        statementId,
        date,
        rawDescription,
        normalizedMerchant: normalizeMerchant(rawDescription),
        amount: Math.abs(signed),
        direction: signed < 0 ? "debit" : "credit",
        currency: "USD",
        categoryId: "unknown",
        confidence: 0,
        transactionType: "unknown",
        isTransfer: false,
        isPersonal: false,
        isDuplicate: false,
        userConfirmed: false,
        aiReason: "Awaiting categorization.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      errors.push(
        `Row ${i + 1 + Math.max(0, headerIndex)}: ${e instanceof Error ? e.message : "Invalid data."}`,
      );
    }
  }
  if (errors.length)
    throw new ParseError(
      `${errors.length} row(s) need correction. No rows from this file were saved. ${errors.slice(0, 5).join(" ")}`,
    );
  return result;
}
export function parseCsv(text: string, id: string, mapping?: Mapping) {
  if (text.includes("\0"))
    throw new ParseError(
      "This is not a readable CSV. Export a new CSV from your bank.",
    );
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.some((e) => e.code !== "UndetectableDelimiter"))
    throw new ParseError(
      "The CSV contains broken quotes or inconsistent columns. Export a fresh copy from your bank.",
    );
  return parseRows(parsed.data, id, mapping);
}
// Read the ZIP directory before ExcelJS inflates content, to cap expansion and reject macros.
function validateXlsxZip(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  let pos = -1;
  for (
    let p = buffer.byteLength - 22;
    p >= Math.max(0, buffer.byteLength - 65557);
    p--
  ) {
    if (view.getUint32(p, true) === 0x06054b50) {
      pos = p;
      break;
    }
  }
  if (pos < 0)
    throw new ParseError(
      "This Excel file is damaged. Export a new XLSX or CSV.",
    );
  const count = view.getUint16(pos + 10, true);
  let off = view.getUint32(pos + 16, true),
    total = 0;
  let found = false;
  if (count > 2000)
    throw new ParseError(
      "This workbook is too complex. Upload a transaction-only CSV.",
    );
  for (let i = 0; i < count; i++) {
    if (
      off + 46 > buffer.byteLength ||
      view.getUint32(off, true) !== 0x02014b50
    )
      throw new ParseError("Invalid Excel archive.");
    const compressed = view.getUint32(off + 20, true),
      size = view.getUint32(off + 24, true),
      nameLen = view.getUint16(off + 28, true),
      extra = view.getUint16(off + 30, true),
      comment = view.getUint16(off + 32, true);
    total += size;
    if (
      total > 25 * 1024 * 1024 ||
      size > 15 * 1024 * 1024 ||
      (size > 1000000 && size / Math.max(1, compressed) > 250)
    )
      throw new ParseError(
        "The workbook expands beyond the safe size limit. Export as CSV.",
      );
    const name = new TextDecoder().decode(
      new Uint8Array(buffer, off + 46, nameLen),
    );
    if (name === "xl/workbook.xml") found = true;
    if (/vbaProject|externalLinks/i.test(name))
      throw new ParseError(
        "Macros and linked workbooks are not supported. Export a plain CSV.",
      );
    off += 46 + nameLen + extra + comment;
  }
  if (!found) throw new ParseError("This file is not an XLSX workbook.");
}
export async function parseXlsx(
  buffer: ArrayBuffer,
  id: string,
  mapping?: Mapping,
) {
  validateXlsxZip(buffer);
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
  } catch {
    throw new ParseError(
      "We couldn’t open this workbook. Remove any password or export it as CSV.",
    );
  }
  const active = workbook.worksheets.filter((s) => s.actualRowCount > 1);
  if (active.length !== 1)
    throw new ParseError(
      "Use a workbook with one transaction sheet. Export each account or sheet as a separate CSV.",
    );
  const rows: unknown[][] = [];
  active[0].eachRow((row) => {
    rows.push(
      (row.values as unknown[]).slice(1).map((v) => {
        if (v && typeof v === "object" && !(v instanceof Date))
          throw new ParseError(
            "Formula and rich-text cells are not supported. Export the sheet as CSV values.",
          );
        return v;
      }),
    );
  });
  return parseRows(rows, id, mapping);
}
export async function parsePdf(buffer: ArrayBuffer, id: string) {
  if (new TextDecoder().decode(new Uint8Array(buffer).slice(0, 5)) !== "%PDF-")
    throw new ParseError(
      "This is not a valid PDF. Export a fresh statement from your bank.",
    );
  const { getDocumentProxy } = await import("unpdf");
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer), {
      isEvalSupported: false,
      useSystemFonts: false,
      stopAtErrors: true,
    } as Parameters<typeof getDocumentProxy>[1]);
    if (pdf.numPages > 100)
      throw new ParseError("Upload PDFs with 100 pages or fewer.");
    const rows: unknown[][] = [["Date", "Description", "Amount"]];
    let candidate = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const lines = new Map<number, { x: number; s: string }[]>();
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = Math.round(item.transform[5]);
        const entries = lines.get(y) || [];
        entries.push({ x: item.transform[4], s: item.str });
        lines.set(y, entries);
      }
      for (const [, items] of [...lines.entries()].sort(
        (a, b) => b[0] - a[0],
      )) {
        const line = items
          .sort((a, b) => a.x - b.x)
          .map((i) => i.s)
          .join(" ")
          .trim();
        if (/^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s/.test(line)) {
          candidate++;
          const match = line.match(
            /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+?)\s+([+-]?\$?[\d,]+\.\d{2}\s?(?:CR|DR)|[+-]\$?[\d,]+\.\d{2}|\(\$?[\d,]+\.\d{2}\))$/i,
          );
          if (match) rows.push([match[1], match[2], match[3]]);
        }
      }
    }
    if (!candidate || rows.length - 1 !== candidate)
      throw new ParseError(
        "We couldn’t reliably read every transaction or its direction from this PDF. Download a CSV or Excel statement from your bank and upload it instead. Scanned PDFs and unsigned PDF amounts are not supported.",
      );
    return parseRows(rows, id);
  } catch (e) {
    if (e instanceof ParseError) throw e;
    throw new ParseError(
      "We couldn’t read this PDF. It may be scanned, password-protected, or damaged. Upload a CSV or Excel export instead.",
    );
  } finally {
    await pdf?.loadingTask.destroy();
  }
}
