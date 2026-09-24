export const NON_AI_BUDGETS = {
  report_create: { hourly: 75, daily: 300 },
  parser: { hourly: 30, daily: 100 },
  process: { hourly: 75, daily: 450 },
  public_events: { hourly: 750, daily: 3_000 },
  // Binary MiB. This circuit reserves only positive persisted report-data growth.
  report_growth: { hourly: 5 * 1024 * 1024, daily: 12 * 1024 * 1024 },
} as const;

export type NonAiBudgetCircuit = keyof typeof NON_AI_BUDGETS;
export type NonAiBudgetScope = "hour" | "day";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const ABUSE_EXHAUSTION_OBSERVATION_LIMIT = 100;

export interface NonAiBudgetEntry {
  key: string;
  limit: number;
  amount: number;
  expiresAt: number;
  scope: NonAiBudgetScope;
}

export function nonAiBudgetEntries(
  circuit: NonAiBudgetCircuit,
  amount: number,
  now: number,
): NonAiBudgetEntry[] {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Invalid global budget reservation amount.");
  const limits = NON_AI_BUDGETS[circuit];
  const hour = Math.floor(now / HOUR_MS);
  const day = Math.floor(now / DAY_MS);
  return [
    {
      key: `abuse:${circuit}:hour:${hour}`,
      limit: limits.hourly,
      amount,
      expiresAt: (hour + 1) * HOUR_MS,
      scope: "hour",
    },
    {
      key: `abuse:${circuit}:day:${day}`,
      limit: limits.daily,
      amount,
      expiresAt: (day + 1) * DAY_MS,
      scope: "day",
    },
  ];
}

export const nonAiBudgetSql = {
  acquire:
    "WITH budgets(key,max_count,amount,expires_at) AS (VALUES (?,?,?,?),(?,?,?,?)) INSERT INTO rate_limits(key,count,expires_at) SELECT key,amount,expires_at FROM budgets WHERE NOT EXISTS (SELECT 1 FROM budgets candidate LEFT JOIN rate_limits existing ON existing.key=candidate.key WHERE COALESCE(existing.count,0)+candidate.amount>candidate.max_count) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+excluded.count,expires_at=excluded.expires_at RETURNING key,count",
  counts: "SELECT key,count FROM rate_limits WHERE key IN (?,?)",
  release:
    "UPDATE rate_limits SET count=MAX(0,count-?) WHERE key=? AND expires_at=?",
  observeExhaustion:
    "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1,expires_at=excluded.expires_at WHERE count<? RETURNING count",
} as const;

export function nonAiBudgetAcquireBindings(entries: NonAiBudgetEntry[]) {
  return entries.flatMap((entry) => [
    entry.key,
    entry.limit,
    entry.amount,
    entry.expiresAt,
  ]);
}

export function exhaustedNonAiBudget(
  entries: NonAiBudgetEntry[],
  counts: Array<{ key: string; count: number }>,
) {
  const byKey = new Map(counts.map((row) => [row.key, row.count]));
  return (
    entries.find(
      (entry) => (byKey.get(entry.key) || 0) + entry.amount > entry.limit,
    )?.scope || "day"
  );
}

export function nonAiExhaustionObservation(
  circuit: NonAiBudgetCircuit,
  scope: NonAiBudgetScope,
  now: number,
) {
  const duration = scope === "hour" ? HOUR_MS : DAY_MS;
  const bucket = Math.floor(now / duration);
  return {
    key: `abuse:exhausted:${circuit}:${scope}:${bucket}`,
    expiresAt: (bucket + 1) * duration,
  };
}

export function shouldEmitAbuseObservation(count: number) {
  return count === 1 || count === 10 || count === 100;
}

export function emitAbuseBudgetObservation(
  circuit: NonAiBudgetCircuit,
  scope: NonAiBudgetScope,
  count: number,
  emit: (line: string) => void = console.warn,
) {
  const line = JSON.stringify({
    event: "abuse_budget_exhausted",
    circuit,
    scope,
    occurrences: count,
  });
  emit(line);
  return line;
}

export function reportGrowthBytes(previousBytes: number, nextBytes: number) {
  if (
    !Number.isSafeInteger(previousBytes) ||
    previousBytes < 0 ||
    !Number.isSafeInteger(nextBytes) ||
    nextBytes < 0
  )
    throw new Error("Invalid report storage size.");
  return Math.max(0, nextBytes - previousBytes);
}

export async function persistWithGrowthReservation<T, R>(input: {
  previousBytes: number;
  nextBytes: number;
  reserve: (amount: number) => Promise<R | null>;
  persist: () => Promise<T>;
  release: (reservation: R) => Promise<void>;
}) {
  const growth = reportGrowthBytes(input.previousBytes, input.nextBytes);
  const reservation = growth ? await input.reserve(growth) : undefined;
  if (growth && !reservation) return { exhausted: true as const, growth };
  try {
    return {
      exhausted: false as const,
      growth,
      value: await input.persist(),
    };
  } catch (error) {
    if (reservation) await input.release(reservation);
    throw error;
  }
}
