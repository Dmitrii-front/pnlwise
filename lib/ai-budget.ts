import type { OperationalDiagnostic } from "./operational-diagnostics";

export const AI_CLASSIFICATION_BATCH_SIZE = 40;
export const AI_REPORT_CALL_LIMIT = 2;
export const AI_SESSION_HOURLY_CALL_LIMIT = 6;
export const AI_IP_HOURLY_CALL_LIMIT = 18;
export const AI_GLOBAL_HOURLY_CALL_LIMIT = 100;
export const AI_GLOBAL_DAILY_CALL_LIMIT = 500;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const REPORT_BUDGET_TTL_MS = 366 * DAY_MS;

export type AiBudgetReason =
  | "report"
  | "session"
  | "ip"
  | "global_hourly"
  | "global_daily";

export interface AiBudgetEntry {
  key: string;
  limit: number;
  expiresAt: number;
  reason: AiBudgetReason;
}

export class AiBudgetExhaustedError extends Error {
  constructor(public reason: AiBudgetReason) {
    super("OpenAI categorization budget exhausted.");
    this.name = "AiBudgetExhaustedError";
  }
}

export function aiBudgetEntries(input: {
  reportId: string;
  sessionHash: string;
  ipHash: string;
  now: number;
}): AiBudgetEntry[] {
  const hour = Math.floor(input.now / HOUR_MS);
  const day = Math.floor(input.now / DAY_MS);
  return [
    {
      key: `ai:report:${input.reportId}`,
      limit: AI_REPORT_CALL_LIMIT,
      expiresAt: input.now + REPORT_BUDGET_TTL_MS,
      reason: "report",
    },
    {
      key: `ai:session:${input.sessionHash}:${hour}`,
      limit: AI_SESSION_HOURLY_CALL_LIMIT,
      expiresAt: (hour + 1) * HOUR_MS,
      reason: "session",
    },
    {
      key: `ai:ip:${input.ipHash}:${hour}`,
      limit: AI_IP_HOURLY_CALL_LIMIT,
      expiresAt: (hour + 1) * HOUR_MS,
      reason: "ip",
    },
    {
      key: `ai:global:hour:${hour}`,
      limit: AI_GLOBAL_HOURLY_CALL_LIMIT,
      expiresAt: (hour + 1) * HOUR_MS,
      reason: "global_hourly",
    },
    {
      key: `ai:global:day:${day}`,
      limit: AI_GLOBAL_DAILY_CALL_LIMIT,
      expiresAt: (day + 1) * DAY_MS,
      reason: "global_daily",
    },
  ];
}

export const aiBudgetSql = {
  acquire:
    "WITH budgets(key,max_count,expires_at) AS (VALUES (?,?,?),(?,?,?),(?,?,?),(?,?,?),(?,?,?)) INSERT INTO rate_limits(key,count,expires_at) SELECT key,1,expires_at FROM budgets WHERE NOT EXISTS (SELECT 1 FROM budgets candidate JOIN rate_limits existing ON existing.key=candidate.key WHERE existing.count>=candidate.max_count) ON CONFLICT(key) DO UPDATE SET count=count+1,expires_at=excluded.expires_at RETURNING key,count",
  counts:
    "SELECT key,count FROM rate_limits WHERE key IN (?,?,?,?,?)",
} as const;

export function aiBudgetAcquireBindings(entries: AiBudgetEntry[]) {
  return entries.flatMap((entry) => [entry.key, entry.limit, entry.expiresAt]);
}

export function exhaustedAiBudget(
  entries: AiBudgetEntry[],
  counts: Array<{ key: string; count: number }>,
) {
  const byKey = new Map(counts.map((row) => [row.key, row.count]));
  return (
    entries.find((entry) => (byKey.get(entry.key) || 0) >= entry.limit)
      ?.reason || "global_daily"
  );
}

export function aiBudgetDiagnostic(
  reason: AiBudgetReason,
): OperationalDiagnostic {
  const codes: Record<AiBudgetReason, string> = {
    report: "AI_BUDGET_REPORT_EXHAUSTED",
    session: "AI_BUDGET_SESSION_EXHAUSTED",
    ip: "AI_BUDGET_IP_EXHAUSTED",
    global_hourly: "AI_BUDGET_GLOBAL_HOURLY_EXHAUSTED",
    global_daily: "AI_BUDGET_GLOBAL_DAILY_EXHAUSTED",
  };
  return {
    code: codes[reason],
    stage: "openai.budget",
    subsystem: "ai",
    route: "api.reports.process",
    provider: "openai",
    retryable: false,
    alertable: false,
  };
}
