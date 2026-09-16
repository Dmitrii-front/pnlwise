import { needsReview, type Report } from "./domain";

export function exportAccess(report: Report) {
  if (!report.paid)
    return {
      allowed: false as const,
      status: 402,
      message: "Complete payment to download this report.",
    };
  if (
    report.status !== "ready" ||
    report.transactions.some(
      (transaction) =>
        transaction.date >= report.periodStart &&
        transaction.date <= report.periodEnd &&
        needsReview(transaction),
    )
  )
    return {
      allowed: false as const,
      status: 409,
      message:
        "Review your latest changes and generate the report again before downloading.",
    };
  return { allowed: true as const };
}
