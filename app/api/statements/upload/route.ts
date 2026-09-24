import {
  api,
  guardOrigin,
  json,
  getReport,
  saveReport,
  sessionRate,
  sha256,
  AppError,
  track,
  requireNonAiBudget,
} from "@/lib/server";
import {
  parseCsv,
  parseXlsx,
  parsePdf,
  ParseError,
  type Mapping,
} from "@/lib/parsing";
import {
  boundedFormData,
  MAX_UPLOAD_BODY_BYTES,
  MAX_UPLOAD_FILE_BYTES,
  MAX_REPORT_TRANSACTIONS,
  RequestBodyTooLargeError,
} from "@/lib/abuse-protection";
export const POST = (req: Request) =>
  api(
    async () => {
      guardOrigin(req);
      await sessionRate(req, "upload", 80);
      let form: FormData;
      try {
        form = await boundedFormData(req, MAX_UPLOAD_BODY_BYTES);
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError)
          throw new AppError("Choose a file smaller than 10 MB.", 413);
        throw new AppError("Choose a valid bank statement upload.");
      }
      const file = form.get("file");
      if (!(file instanceof File))
        throw new AppError("Choose a bank statement file.");
      if (!file.size || file.size > MAX_UPLOAD_FILE_BYTES)
        throw new AppError("Choose a nonempty file smaller than 10 MB.", 413);
      const ext = file.name.split(".").pop()?.toLowerCase();
      const allowed: Record<string, string[]> = {
        csv: [
          "text/csv",
          "application/csv",
          "application/vnd.ms-excel",
          "text/plain",
          "",
        ],
        xlsx: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/octet-stream",
          "",
        ],
        pdf: ["application/pdf", "application/octet-stream", ""],
      };
      if (!ext || !allowed[ext]?.includes(file.type))
        throw new AppError("Upload a PDF, CSV, or XLSX bank statement.");
      const report = await getReport(String(form.get("reportId") || ""));
      if (report.status !== "upload")
        throw new AppError(
          "This report has already been processed. Start a new report to add files.",
        );
      if (report.statements.length >= 24)
        throw new AppError("Use up to 24 statements per report.");
      let mapping: Mapping | undefined;
      try {
        if (form.get("mapping"))
          mapping = JSON.parse(String(form.get("mapping")));
      } catch {
        throw new AppError("Choose valid column mappings.");
      }
      await requireNonAiBudget("parser");
      const bytes = await file.arrayBuffer(),
        hash = await sha256(bytes);
      if (report.statements.some((s) => s.hash === hash))
        return json({ report, duplicate: true });
      const id = crypto.randomUUID();
      try {
        const rows =
          ext === "csv"
            ? parseCsv(
                new TextDecoder("utf-8", { fatal: true }).decode(bytes),
                id,
                mapping,
              )
            : ext === "xlsx"
              ? await parseXlsx(bytes, id, mapping)
              : await parsePdf(bytes, id);
        if (
          report.transactions.length + rows.length >
          MAX_REPORT_TRANSACTIONS
        )
          throw new AppError(
            "Use up to 5,000 transactions per report. Split your reporting period.",
          );
        report.transactions.push(...rows);
        report.statements.push({
          id,
          name: file.name.replace(/[\x00-\x1f\/\\<>]/g, "_").slice(0, 150),
          hash,
          format: ext,
          rows: rows.length,
          account: String(form.get("account") || "").slice(0, 40),
          status: "read",
          amountConvention: mapping?.convention,
        });
        const saved = await saveReport(report);
        await track("upload_completed", {
          fileType: ext,
          statementCount: report.statements.length,
          transactionCount: rows.length,
        });
        return json({ report: saved });
      } catch (e) {
        if (e instanceof ParseError)
          throw new AppError(
            e.message,
            422,
            e.headers ? { headers: e.headers } : undefined,
            {
              code: "PARSER_REJECTED_STATEMENT",
              stage: `parser.${ext}`,
            },
          );
        if (e instanceof AppError) throw e;
        throw new AppError(
          "This statement could not be read because of a temporary processing error.",
          500,
          undefined,
          {
            code: "PARSER_INTERNAL_FAILURE",
            stage: `parser.${ext}.internal`,
            retryable: true,
            alertable: true,
          },
        );
      }
    },
    {
      subsystem: "parsing",
      route: "api.statements.upload",
      stage: "parser.upload",
    },
  );
