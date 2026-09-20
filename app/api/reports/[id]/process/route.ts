import {
  api,
  body,
  json,
  guardOrigin,
  getReport,
  saveReport,
  sessionRate,
  track,
  AppError,
  setting,
  claimReportProcessing,
  releaseReportProcessing,
} from "@/lib/server";
import {
  classify,
  detectDuplicates,
  detectTransfers,
  calculateDraftPnl,
  needsReview,
  validDate,
} from "@/lib/domain";
import { aiCategorize } from "@/lib/ai";
export const POST = (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) =>
  api(
    async () => {
      guardOrigin(req);
      await sessionRate(req, "analyze", 150);
      const { id } = await params;
      let report = await getReport(id);
      const input = await body(req);
      if (input.stage !== report.stage) return json({ report });
      if (report.stage >= 6) return json({ report });
      if (!report.transactions.length)
        throw new AppError(
          "Upload at least one statement containing transactions.",
        );
      const processingClaim = await claimReportProcessing(id);
      if (processingClaim === null)
        throw new AppError(
          "This report is already being processed. Please wait and try again.",
          409,
        );
      try {
        report = await getReport(id);
        if (input.stage !== report.stage) return json({ report });
        if (report.stage >= 6) return json({ report });
        switch (report.stage) {
          case 0:
            await track("analysis_started", {
              statementCount: report.statements.length,
            });
            report.status = "processing";
            break;
          case 1: {
            const dates = report.transactions.map((t) => t.date).sort();
            report.periodStart ||= dates[0];
            report.periodEnd ||= dates[dates.length - 1];
            if (!validDate(report.periodStart) || !validDate(report.periodEnd))
              throw new AppError(
                "The reporting dates are invalid. Start a report with explicit dates.",
              );
            if (
              !report.transactions.some(
                (t) =>
                  t.date >= report.periodStart && t.date <= report.periodEnd,
              )
            )
              throw new AppError(
                "No transactions fall within the selected period. Start a new report with dates that match the statements.",
              );
            break;
          }
          case 2:
            report.transactions = detectDuplicates(
              report.transactions,
              report.statements,
            );
            break;
          case 3:
            report.transactions = detectTransfers(
              report.transactions.map(classify),
              report.statements,
            );
            break;
          case 4: {
            // Bound each AI request; unresolved transactions remain available for manual review.
            const cursor = report.aiCursor || 0;
            const pending = report.transactions.slice(cursor, cursor + 40);
            const result = await aiCategorize(pending, report.businessType);
            const updates = new Map(result.transactions.map((t) => [t.id, t]));
            report.transactions = report.transactions.map(
              (t) => updates.get(t.id) || t,
            );
            report.aiCursor = cursor + 40;
            if (result.warning && !report.warnings.includes(result.warning))
              report.warnings.push(result.warning);
            if (
              !result.warning &&
              setting("OPENAI_API_KEY") &&
              setting("OPENAI_MODEL") &&
              report.aiCursor < report.transactions.length
            )
              return json({ report: await saveReport(report) });
            break;
          }
          case 5:
            try {
              calculateDraftPnl(
                report.transactions,
                report.periodStart,
                report.periodEnd,
              );
            } catch {
              throw new AppError(
                "The report could not be generated. Your reviewed transactions are saved.",
                500,
                undefined,
                {
                  code: "REPORT_GENERATION_FAILED",
                  stage: "report.generation",
                  retryable: true,
                  alertable: true,
                },
              );
            }
            report.status = "review";
            await track("analysis_completed", {
              transactionCount: report.transactions.length,
              reviewCount: report.transactions.filter(needsReview).length,
            });
            break;
        }
        report.stage++;
        report = await saveReport(report);
        return json({ report });
      } finally {
        await releaseReportProcessing(id, processingClaim);
      }
    },
    {
      subsystem: "reports",
      route: "api.reports.process",
      stage: "report.processing",
    },
  );
