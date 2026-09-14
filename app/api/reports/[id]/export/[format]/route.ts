import { api, getReport, AppError, track } from "@/lib/server";
import { csvExport, pdfExport, xlsxExport } from "@/lib/export";
import { needsReview } from "@/lib/domain";
import { config } from "@/lib/config";
export const GET = (
  req: Request,
  { params }: { params: Promise<{ id: string; format: string }> },
) =>
  api(async () => {
    const { id, format } = await params;
    const report = await getReport(id);
    if (!report.paid)
      throw new AppError("Complete payment to download this report.", 402);
    if (
      report.status !== "ready" ||
      report.transactions.some(
        (t) =>
          t.date >= report.periodStart &&
          t.date <= report.periodEnd &&
          needsReview(t),
      )
    )
      throw new AppError(
        "Review your latest changes and generate the report again before downloading.",
        409,
      );
    if (!["pdf", "xlsx", "csv"].includes(format))
      throw new AppError("Choose PDF, Excel, or CSV.", 404);
    const bytes =
      format === "pdf"
        ? await pdfExport(report)
        : format === "xlsx"
          ? await xlsxExport(report)
          : csvExport(report);
    await track("report_downloaded", { format });
    return new Response(
      typeof bytes === "string" ? bytes : new Uint8Array(bytes),
      {
        headers: {
          "Content-Type":
            format === "pdf"
              ? "application/pdf"
              : format === "xlsx"
                ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                : "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${config.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${report.periodStart}-${report.periodEnd}.${format}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Robots-Tag": "noindex, nofollow",
        },
      },
    );
  });
