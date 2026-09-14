import { config } from "./config";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  calculatePnl,
  categories,
  categoryById,
  money,
  percent,
  type Report,
} from "./domain";
export const exportDisclaimer =
  "Estimated cash-basis report from user-provided data. Not prepared or certified by a CPA. Review all categories before relying on this report. Consult a qualified professional when appropriate.";
export function statementLines(report: Report) {
  const p = calculatePnl(
    report.transactions,
    report.periodStart,
    report.periodEnd,
  );
  const lines: {
    label: string;
    value?: number | string;
    kind: "heading" | "total" | "row" | "net";
  }[] = [];
  for (const [g, title, total] of [
    ["revenue", "Revenue", p.revenue],
    ["cogs", "Cost of Goods Sold", p.cogs],
  ] as const) {
    lines.push({ label: title, kind: "heading" });
    for (const c of categories.filter((c) => c.group === g && p.totals[c.id]))
      lines.push({ label: c.label, value: p.totals[c.id], kind: "row" });
    lines.push({ label: `Total ${title}`, value: total, kind: "total" });
  }
  lines.push(
    { label: "Gross Profit", value: p.grossProfit, kind: "total" },
    { label: "Gross Margin", value: percent(p.grossMargin), kind: "row" },
    { label: "Operating Expenses", kind: "heading" },
  );
  for (const c of categories.filter(
    (c) => c.group === "opex" && p.totals[c.id],
  ))
    lines.push({ label: c.label, value: p.totals[c.id], kind: "row" });
  lines.push(
    { label: "Total Operating Expenses", value: p.opex, kind: "total" },
    { label: "Operating Profit", value: p.operatingProfit, kind: "total" },
    { label: "Interest", value: p.interest, kind: "row" },
    { label: "Net Profit", value: p.netProfit, kind: "net" },
    { label: "Net Margin", value: percent(p.netMargin), kind: "row" },
  );
  return lines;
}
export async function pdfExport(report: Report) {
  const doc = await PDFDocument.create();
  doc.setTitle(
    `${report.businessName || "Business"} — Profit & Loss Statement`,
  );
  doc.setAuthor(config.name);
  doc.setSubject("Estimated cash-basis financial report");
  const regular = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.09, 0.35, 0.25),
    dark = rgb(0.15, 0.21, 0.16),
    muted = rgb(0.4, 0.45, 0.39);
  let page = doc.addPage([612, 792]),
    y = 740,
    pageNo = 1;
  const text = (
    s: string,
    x: number,
    posY: number,
    size = 10,
    b = false,
    color = dark,
  ) => {
    const clean = s.replace(/[^\x20-\x7E\u00a0-\u00ff]/g, "-");
    page.drawText(clean, { x, y: posY, size, font: b ? bold : regular, color });
  };
  const footer = () => {
    let line = "",
      fy = 53;
    for (const word of exportDisclaimer.split(" ")) {
      if ((line + " " + word).length > 106) {
        text(line, 48, fy, 7, false, muted);
        fy -= 10;
        line = word;
      } else line += (line ? " " : "") + word;
    }
    if (line) text(line, 48, fy, 7, false, muted);
    text(
      `${config.name.toLowerCase()}. | ${report.isSample ? "SAMPLE - " : ""}USD | Cash basis`,
      48,
      20,
      8,
      false,
      muted,
    );
    text(String(pageNo), 552, 20, 8, false, muted);
  };
  const header = () => {
    text(config.name.toLowerCase() + ".", 48, y, 15, true, green);
    y -= 38;
    const name = report.businessName || "Your business";
    text(name.length > 64 ? name.slice(0, 61) + "..." : name, 48, y, 11, true);
    y -= 28;
    text("Profit & Loss Statement", 48, y, 24, true);
    y -= 22;
    text(
      `${report.periodStart} to ${report.periodEnd} | USD | Cash basis${report.isSample ? " | SAMPLE" : ""}`,
      48,
      y,
      9,
      false,
      muted,
    );
    y -= 28;
    page.drawLine({
      start: { x: 48, y },
      end: { x: 564, y },
      thickness: 1,
      color: rgb(0.85, 0.89, 0.84),
    });
    y -= 24;
  };
  header();
  for (const l of statementLines(report)) {
    if (y < 108) {
      footer();
      page = doc.addPage([612, 792]);
      pageNo++;
      y = 740;
      header();
    }
    if (l.kind === "heading") {
      y -= 7;
      text(l.label, 48, y, 11, true, green);
      y -= 23;
      continue;
    }
    const net = l.kind === "net";
    if (net) {
      page.drawRectangle({
        x: 40,
        y: y - 12,
        width: 532,
        height: 35,
        color: rgb(0.93, 0.96, 0.92),
      });
    }
    text(
      l.label,
      l.kind === "row" ? 59 : 48,
      y,
      net ? 12 : 10,
      l.kind !== "row",
    );
    const value = typeof l.value === "number" ? money(l.value) : l.value || "";
    const width = (l.kind !== "row" ? bold : regular).widthOfTextAtSize(
      value,
      net ? 12 : 10,
    );
    text(
      value,
      564 - width,
      y,
      net ? 12 : 10,
      l.kind !== "row",
      net ? green : dark,
    );
    y -= net ? 36 : 24;
  }
  footer();
  return doc.save();
}
export async function xlsxExport(report: Report) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = config.name;
  const sheet = wb.addWorksheet("P&L");
  sheet.columns = [{ width: 44 }, { width: 22 }];
  sheet.addRow([report.businessName || "Your business"]);
  sheet.addRow(["Profit & Loss Statement"]);
  sheet.addRow([
    `${report.periodStart} — ${report.periodEnd}`,
    "USD · Cash basis",
  ]);
  sheet.addRow([]);
  for (const line of statementLines(report)) {
    const row = sheet.addRow([
      line.label,
      typeof line.value === "number" ? line.value / 100 : (line.value ?? ""),
    ]);
    row.getCell(2).numFmt = '"$"#,##0.00;[Red]("$"#,##0.00)';
    if (line.kind !== "row") {
      row.font = { bold: true, color: { argb: "FF175C48" } };
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: line.kind === "net" ? "FFE5F1E3" : "FFF4F7F1" },
      };
    }
  }
  sheet.addRow([]);
  const noteRow = sheet.addRow([exportDisclaimer]);
  sheet.mergeCells(`A${noteRow.number}:B${noteRow.number}`);
  noteRow.height = 60;
  noteRow.alignment = { wrapText: true, vertical: "top" };
  sheet.getRow(1).font = { size: 14, bold: true };
  sheet.getRow(2).font = { size: 18, bold: true };
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  sheet.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
  };
  const tx = wb.addWorksheet("Transactions");
  tx.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Description", key: "description", width: 48 },
    { header: "Merchant", key: "merchant", width: 32 },
    { header: "Amount (USD)", key: "amount", width: 18 },
    { header: "Type", key: "type", width: 22 },
    { header: "Category", key: "category", width: 32 },
    { header: "Included in P&L", key: "included", width: 20 },
    { header: "Confidence", key: "confidence", width: 14 },
    { header: "Confirmed", key: "confirmed", width: 14 },
  ];
  for (const t of report.transactions) {
    const c = categoryById[t.categoryId];
    tx.addRow({
      date: t.date,
      description: t.rawDescription,
      merchant: t.normalizedMerchant,
      amount: ((t.direction === "credit" ? 1 : -1) * t.amount) / 100,
      type: t.transactionType,
      category: c.label,
      included:
        c.group !== "excluded" &&
        !t.isDuplicate &&
        t.date >= report.periodStart &&
        t.date <= report.periodEnd
          ? "Yes"
          : "No",
      confidence: t.confidence,
      confirmed: t.userConfirmed ? "Yes" : "No",
    });
  }
  tx.getColumn("amount").numFmt = '"$"#,##0.00;[Red]("$"#,##0.00)';
  tx.getColumn("confidence").numFmt = "0%";
  tx.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  tx.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF175C48" },
  };
  tx.views = [{ state: "frozen", ySplit: 1 }];
  tx.autoFilter = { from: "A1", to: `I${tx.rowCount}` };
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
export function csvExport(report: Report) {
  const escape = (s: unknown) => {
    let str = String(s);
    if (/^[\s]*[=+@\-\t\r]/.test(str)) str = "'" + str;
    return '"' + str.replace(/"/g, '""') + '"';
  };
  const rows = [
    [
      "Date",
      "Description",
      "Merchant",
      "Amount (USD)",
      "Direction",
      "Type",
      "Category",
      "Included in P&L",
    ],
    ...report.transactions.map((t) => [
      t.date,
      t.rawDescription,
      t.normalizedMerchant,
      (t.amount / 100).toFixed(2),
      t.direction,
      t.transactionType,
      categoryById[t.categoryId].label,
      categoryById[t.categoryId].group !== "excluded" &&
      !t.isDuplicate &&
      t.date >= report.periodStart &&
      t.date <= report.periodEnd
        ? "Yes"
        : "No",
    ]),
  ];
  return "\uFEFF" + rows.map((r) => r.map(escape).join(",")).join("\r\n");
}
