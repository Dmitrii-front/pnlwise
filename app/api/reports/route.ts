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
} from "@/lib/server";
import { businessTypes, validDate, type Report } from "@/lib/domain";
export const POST = (req: Request) =>
  api(async () => {
    guardOrigin(req);
    await cleanupExpired();
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
    const days = Math.max(1, Math.min(365, config.retentionDays));
    await db()
      .prepare(
        "INSERT INTO reports(id,session_hash,user_id,data,revision,paid,created_at,expires_at) VALUES(?,?,?,?,0,0,?,?)",
      )
      .bind(
        report.id,
        await session(),
        (await accountUser())?.id || null,
        JSON.stringify(report),
        Date.now(),
        Date.now() + days * 86400000,
      )
      .run();
    await track("upload_started", { businessType: report.businessType });
    return json({ report }, 201);
  });
