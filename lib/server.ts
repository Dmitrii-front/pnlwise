import {
  operationalErrorWasReported,
  reportOperationalError,
} from "./monitoring";
import type { OperationalDiagnostic } from "./operational-diagnostics";
import { accountUser } from "./auth";
import { config } from "./config";
import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { hasUnresolvedRefund, type Report } from "./domain";
import { readOperationalIdentity } from "./operational-identity";
import {
  retentionSql,
  runRetentionCleanup,
  type RetentionStore,
} from "./retention";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: unknown,
    public diagnostic?: OperationalDiagnostic,
  ) {
    super(message);
  }
}
export function db() {
  if (!env.DB)
    throw new AppError(
      "Report storage is temporarily unavailable. Please try again shortly.",
      503,
      undefined,
      { code: "D1_BINDING_MISSING", stage: "d1.binding", alertable: true },
    );
  return env.DB;
}
export function setting(key: string) {
  return (
    (env as unknown as Record<string, string | undefined>)[key] ||
    process.env[key]
  );
}
export function operationalIdentity() {
  return readOperationalIdentity(setting);
}
export function price() {
  const n = config.priceCents;
  return Number.isInteger(n) && n >= 50 && n <= 100000 ? n : 1299;
}
export async function sha256(value: string | ArrayBuffer) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function session(create = false) {
  const jar = await cookies();
  let token = jar.get("cl_session")?.value;
  if (!token || !/^[-a-f0-9]{72}$/.test(token)) {
    if (!create)
      throw new AppError(
        "Your session has expired. Please start a new report in this browser.",
        401,
      );
    token = crypto.randomUUID() + crypto.randomUUID();
    jar.set("cl_session", token, {
      httpOnly: true,
      secure:
        setting("COOKIE_SECURE") !== "false" &&
        process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: config.retentionDays * 86400,
    });
  }
  return sha256(token);
}
export async function getReport(id: string) {
  const owner = await session(true);
  const user = await accountUser();
  const row = await db()
    .prepare(
      "SELECT data,revision,paid FROM reports WHERE id=? AND (session_hash=? OR user_id=?) AND expires_at>?",
    )
    .bind(id, owner, user?.id || "", Date.now())
    .first<{ data: string; revision: number; paid: number }>();
  if (!row)
    throw new AppError(
      "This report is unavailable in this browser or has expired. Start a new report.",
      404,
    );
  const report = {
    ...JSON.parse(row.data),
    revision: row.revision,
    paid: !!row.paid,
  } as Report;
  if (hasUnresolvedRefund(report)) report.status = "review";
  return report;
}
export async function saveReport(report: Report) {
  const owner = await session(true);
  const user = await accountUser();
  const revision = report.revision;
  const next = { ...report, revision: revision + 1 };
  if (new TextEncoder().encode(JSON.stringify(next)).byteLength > 1800000)
    throw new AppError(
      "This report contains too much transaction detail. Split it into smaller reporting periods.",
      413,
    );
  const result = await db()
    .prepare(
      "UPDATE reports SET data=?,revision=revision+1 WHERE id=? AND (session_hash=? OR user_id=?) AND revision=?",
    )
    .bind(JSON.stringify(next), report.id, owner, user?.id || "", revision)
    .run();
  if (!result.meta.changes)
    throw new AppError(
      "This report changed in another tab. Refresh and try again.",
      409,
    );
  return next;
}
export function guardOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new AppError(
      "This request could not be verified. Reload this page and try again.",
      403,
    );
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const bucket = Math.floor(Date.now() / 1000 / seconds);
  const row = await db()
    .prepare(
      "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(`${key}:${bucket}`, Date.now() + seconds * 1000)
    .first<{ count: number }>();
  if ((row?.count || 0) > limit)
    throw new AppError(
      "Too many requests. Please wait a few minutes and try again.",
      429,
    );
}
export async function sessionRate(
  request: Request,
  name: string,
  limit: number,
  seconds = 3600,
) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  await rateLimit(`${name}:${await sha256(ip)}`, limit * 3, seconds);
  await rateLimit(`${name}:${await session(true)}`, limit, seconds);
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function api(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) {
      if (error.diagnostic && !operationalErrorWasReported(error))
        await reportOperationalError(error.diagnostic, error);
      return json(
        { error: error.message, details: error.details },
        error.status,
      );
    }
    if (!operationalErrorWasReported(error))
      await reportOperationalError(
        { code: "REQUEST_FAILED", stage: "api.request", alertable: true },
        error,
      );
    await track("server_error", {
      kind: error instanceof Error ? error.name : "UnknownError",
    }).catch(() => {});
    return json(
      {
        error:
          "Something went wrong while saving your work. Please retry. Your completed steps are preserved.",
      },
      500,
    );
  }
}
export async function body(request: Request) {
  const raw = await request.text();
  if (raw.length > 100000) throw new AppError("Request too large.", 413);
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("Invalid request. Reload and try again.");
  }
}
export async function track(
  name: string,
  metadata: Record<string, unknown> = {},
) {
  const allowed = [
    "landing",
    "referral",
    "fileType",
    "statementCount",
    "transactionCount",
    "businessType",
    "reviewCount",
    "format",
    "kind",
    "removed",
    "batches",
    "remaining",
    "code",
    "stage",
  ];
  const safe = Object.fromEntries(
    Object.entries(metadata)
      .filter(
        ([k, v]) =>
          allowed.includes(k) &&
          ["string", "number", "boolean"].includes(typeof v),
      )
      .map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 160) : v]),
  );
  await db()
    .prepare("INSERT INTO events(id,name,metadata,created_at) VALUES(?,?,?,?)")
    .bind(crypto.randomUUID(), name, JSON.stringify(safe), Date.now())
    .run();
}

const retentionStore: RetentionStore = {
  async deleteExpiredReports(now, limit) {
    const result = await db()
      .prepare(retentionSql.deleteExpiredReports)
      .bind(now, limit)
      .run();
    return result.meta.changes || 0;
  },
  async hasExpiredReports(now) {
    return !!(await db()
      .prepare(retentionSql.hasExpiredReports)
      .bind(now)
      .first());
  },
  async cleanupAuxiliary(now) {
    await db().batch([
      db().prepare(retentionSql.deleteExpiredRateLimits).bind(now),
      db()
        .prepare(retentionSql.deleteExpiredAnalytics)
        .bind(now - 90 * 86400000),
    ]);
  },
};

export async function cleanupExpired(recordResult = false) {
  const result = await runRetentionCleanup(retentionStore);
  if (recordResult)
    await track("maintenance_cleanup", {
      removed: result.removed,
      batches: result.batches,
      remaining: result.remaining,
    });
  return result;
}
