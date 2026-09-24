import { accountUser } from "@/lib/auth";
import { config } from "@/lib/config";
import {
  api,
  body,
  db,
  guardOrigin,
  json,
  session,
  sessionRate,
  track,
  AppError,
  cleanupExpired,
  globalBudgetExhaustedError,
  releaseNonAiBudget,
  requireNonAiBudget,
  reserveReportGrowth,
} from "@/lib/server";
import { businessTypes, validDate, type Report } from "@/lib/domain";
import { persistWithGrowthReservation } from "@/lib/non-ai-budget";
export const POST = (req: Request) =>
  api(async () => {
    guardOrigin(req);
    await sessionRate(req, "create", 15);
    const input = await body(req);
    if (!businessTypes.includes(input.businessType))
      throw new AppError("Select your business type.");
    const start = String(input.periodStart || ""),
      end = String(input.periodEnd || "");
    if ((start || end) && (!validDate(start) || !validDate(end) || start > end))
      throw new AppError("Choose a valid reporting period.");
    const report: Report = {
      id: crypto.randomUUID(),
      businessName: String(input.businessName || "")
        .trim()
        .slice(0, 100),
      businessType: input.businessType,
      periodStart: start,
      periodEnd: end,
      transactions: [],
      statements: [],
      status: "upload",
      stage: 0,
      paid: false,
      revision: 0,
      createdAt: new Date().toISOString(),
      warnings: [],
      rules: {},
    };
    await requireNonAiBudget("report_create");
    const days = Math.max(1, Math.min(365, config.retentionDays));
    const data = JSON.stringify(report);
    const persisted = await persistWithGrowthReservation({
      previousBytes: 0,
      nextBytes: new TextEncoder().encode(data).byteLength,
      reserve: reserveReportGrowth,
      release: releaseNonAiBudget,
      persist: async () => {
        await cleanupExpired();
        const now = Date.now();
        return db()
          .prepare(
            "INSERT INTO reports(id,session_hash,user_id,data,revision,paid,created_at,expires_at) VALUES(?,?,?,?,0,0,?,?)",
          )
          .bind(
            report.id,
            await session(),
            (await accountUser())?.id || null,
            data,
            now,
            now + days * 86400000,
          )
          .run();
      },
    });
    if (persisted.exhausted) throw globalBudgetExhaustedError();
    await track("upload_started", { businessType: report.businessType });
    return json({ report }, 201);
  });
