import { api, getReport, AppError, track } from "@/lib/server";
import { csvExport, pdfExport, xlsxExport } from "@/lib/export";
import { config } from "@/lib/config";
import { exportAccess } from "@/lib/export-access";
export const GET = (
  req: Request,
  { params }: { params: Promise<{ id: string; format: string }> },
) =>
  api(async () => {
    const { id, format } = await params;
    const report = await getReport(id);
    const access = exportAccess(report);
    if (!access.allowed) throw new AppError(access.message, access.status);
    if (!["pdf", "xlsx", "csv"].includes(format))
      throw new AppError("Choose PDF, Excel, or CSV.", 404);
    let bytes;
    try {
      bytes =
        format === "pdf"
          ? await pdfExport(report)
          : format === "xlsx"
            ? await xlsxExport(report)
            : csvExport(report);
    } catch {
      throw new AppError(
        "Your export could not be generated. Please try again.",
        500,
        undefined,
        {
          code: "EXPORT_GENERATION_FAILED",
          stage: `export.${format}`,
          alertable: true,
        },
      );
    }
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
