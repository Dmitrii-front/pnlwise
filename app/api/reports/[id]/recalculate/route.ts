import {
  api,
  body,
  json,
  guardOrigin,
  getReport,
  saveReport,
  AppError,
  track,
  sessionRate,
} from "@/lib/server";
import { needsReview, calculatePnl, validDate } from "@/lib/domain";
export const POST = (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) =>
  api(async () => {
    guardOrigin(req);
    await sessionRate(req, "edit", 500);
    const { id } = await params;
    let report = await getReport(id);
    const input = await body(req);
    if (report.revision !== input.revision)
      throw new AppError(
        "This report changed in another tab. Refresh and try again.",
        409,
      );
    if (input.businessName !== undefined)
      report.businessName = String(input.businessName).slice(0, 100);
    if (input.periodStart || input.periodEnd) {
      if (
        !validDate(input.periodStart) ||
        !validDate(input.periodEnd) ||
        input.periodStart > input.periodEnd
      )
        throw new AppError("Choose a valid reporting period.");
      report.periodStart = input.periodStart;
      report.periodEnd = input.periodEnd;
    }
    if (report.stage < 6)
      throw new AppError("Finish processing your statements first.");
    const review = report.transactions.filter(
      (t) =>
        t.date >= report.periodStart &&
        t.date <= report.periodEnd &&
        needsReview(t),
    );
    if (review.length)
      throw new AppError(
        `${review.length} transaction(s) still need review. Confirm their categories before generating your P&L.`,
        422,
      );
    const pnl = calculatePnl(
      report.transactions,
      report.periodStart,
      report.periodEnd,
    );
    if (!pnl.inPeriod)
      throw new AppError("There are no transactions in this reporting period.");
    report.status = "ready";
    report = await saveReport(report);
    await track("report_generated", {
      transactionCount: pnl.inPeriod,
      businessType: report.businessType,
    });
    return json({ report, pnl });
  });
