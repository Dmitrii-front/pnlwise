import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  ABUSE_EXHAUSTION_OBSERVATION_LIMIT,
  NON_AI_BUDGETS,
  emitAbuseBudgetObservation,
  exhaustedNonAiBudget,
  nonAiBudgetAcquireBindings,
  nonAiBudgetEntries,
  nonAiBudgetSql,
  persistWithGrowthReservation,
  reportGrowthBytes,
  shouldEmitAbuseObservation,
  type NonAiBudgetEntry,
} from "../lib/non-ai-budget";

function budgetDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(
    "CREATE TABLE rate_limits(key text PRIMARY KEY NOT NULL,count integer NOT NULL,expires_at integer NOT NULL)",
  );
  return database;
}

function entries(input: {
  now?: number;
  amount?: number;
  hourly?: number;
  daily?: number;
}) {
  return nonAiBudgetEntries(
    "report_create",
    input.amount ?? 1,
    input.now ?? 1_800_000,
  ).map((entry) => ({
    ...entry,
    limit: entry.scope === "hour" ? input.hourly ?? 3 : input.daily ?? 100,
  }));
}

function claim(database: DatabaseSync, budgets: NonAiBudgetEntry[]) {
  const acquired = database
    .prepare(nonAiBudgetSql.acquire)
    .all(...nonAiBudgetAcquireBindings(budgets)) as unknown as Array<{
    key: string;
    count: number;
  }>;
  if (acquired.length === budgets.length) return null;
  assert.equal(acquired.length, 0);
  const counts = database
    .prepare(nonAiBudgetSql.counts)
    .all(...budgets.map((budget) => budget.key)) as unknown as Array<{
    key: string;
    count: number;
  }>;
  return exhaustedNonAiBudget(budgets, counts);
}

test("launch budgets preserve one maximum documented workflow", () => {
  assert.equal(NON_AI_BUDGETS.report_create.hourly, 75);
  assert.ok(NON_AI_BUDGETS.parser.hourly >= 24);
  assert.ok(NON_AI_BUDGETS.process.hourly >= 6);
  assert.deepEqual(NON_AI_BUDGETS.report_growth, {
    hourly: 5 * 1024 * 1024,
    daily: 12 * 1024 * 1024,
  });
});

test("concurrent reservations cannot exceed the hourly ceiling", async () => {
  const database = budgetDatabase();
  const results = await Promise.all(
    Array.from({ length: 20 }, async () => {
      await Promise.resolve();
      return claim(database, entries({ hourly: 7 }));
    }),
  );
  assert.equal(results.filter((result) => result === null).length, 7);
  assert.equal(results.filter((result) => result === "hour").length, 13);
  assert.equal(
    (database
      .prepare("SELECT count FROM rate_limits WHERE key LIKE '%:hour:%'")
      .get() as { count: number }).count,
    7,
  );
});

test("concurrent reservations cannot exceed the daily ceiling", async () => {
  const database = budgetDatabase();
  const results = await Promise.all(
    Array.from({ length: 9 }, async (_, index) => {
      await Promise.resolve();
      return claim(
        database,
        entries({ now: index * 3_600_000, hourly: 10, daily: 5 }),
      );
    }),
  );
  assert.equal(results.filter((result) => result === null).length, 5);
  assert.equal(results.filter((result) => result === "day").length, 4);
  assert.equal(
    (database
      .prepare("SELECT count FROM rate_limits WHERE key LIKE '%:day:%'")
      .get() as { count: number }).count,
    5,
  );
});

test("rejected and already exhausted reservations never increment past a ceiling", () => {
  const database = budgetDatabase();
  const budgets = entries({ hourly: 2 });
  assert.equal(claim(database, budgets), null);
  assert.equal(claim(database, budgets), null);
  for (let index = 0; index < 20; index++)
    assert.equal(claim(database, budgets), "hour");
  const counts = database
    .prepare("SELECT key,count FROM rate_limits ORDER BY key")
    .all() as unknown as Array<{ key: string; count: number }>;
  assert.deepEqual(
    counts.map((row) => row.count),
    [2, 2],
  );
});

test("hour and day buckets roll over independently", () => {
  const database = budgetDatabase();
  const nearEnd = 23 * 3_600_000;
  assert.equal(claim(database, entries({ now: nearEnd, hourly: 1 })), null);
  assert.equal(claim(database, entries({ now: nearEnd, hourly: 1 })), "hour");
  assert.equal(
    claim(database, entries({ now: nearEnd + 3_600_000, hourly: 1 })),
    null,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM rate_limits WHERE key LIKE '%:hour:%'")
      .get()!.count,
    2,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM rate_limits WHERE key LIKE '%:day:%'")
      .get()!.count,
    2,
  );
});

test("weighted byte reservations are atomic and refundable", () => {
  const database = budgetDatabase();
  const first = entries({ amount: 6, hourly: 10, daily: 20 });
  const second = entries({ amount: 5, hourly: 10, daily: 20 });
  assert.equal(claim(database, first), null);
  assert.equal(claim(database, second), "hour");
  for (const entry of first)
    database
      .prepare(nonAiBudgetSql.release)
      .run(entry.amount, entry.key, entry.expiresAt);
  assert.equal(claim(database, second), null);
});

test("concurrent report growth cannot exceed its byte ceiling", async () => {
  const database = budgetDatabase();
  const results = await Promise.all(
    Array.from({ length: 8 }, async () => {
      await Promise.resolve();
      return claim(
        database,
        entries({ amount: 4, hourly: 10, daily: 100 }),
      );
    }),
  );
  assert.equal(results.filter((result) => result === null).length, 2);
  assert.equal(results.filter((result) => result === "hour").length, 6);
  assert.equal(
    (database
      .prepare("SELECT count FROM rate_limits WHERE key LIKE '%:hour:%'")
      .get() as { count: number }).count,
    8,
  );
});

test("report growth charges only positive bytes and refunds failed persistence", async () => {
  assert.equal(reportGrowthBytes(100, 150), 50);
  assert.equal(reportGrowthBytes(100, 100), 0);
  assert.equal(reportGrowthBytes(100, 80), 0);

  const released: number[] = [];
  await assert.rejects(
    persistWithGrowthReservation({
      previousBytes: 100,
      nextBytes: 150,
      reserve: async (amount) => ({ amount }),
      release: async (reservation) => {
        released.push(reservation.amount);
      },
      persist: async () => {
        throw new Error("write failed");
      },
    }),
    /write failed/,
  );
  assert.deepEqual(released, [50]);

  let reserves = 0;
  const rewrite = await persistWithGrowthReservation({
    previousBytes: 150,
    nextBytes: 150,
    reserve: async () => {
      reserves++;
      return {};
    },
    release: async () => undefined,
    persist: async () => "saved",
  });
  assert.equal(rewrite.value, "saved");
  assert.equal(reserves, 0);
});

test("budget storage failure fails closed", () => {
  const database = budgetDatabase();
  database.close();
  assert.throws(() => claim(database, entries({})), /database is not open/i);
});

test("exhaustion observation saturates and emits only bounded milestones", () => {
  const database = budgetDatabase();
  const counts: number[] = [];
  for (let index = 0; index < ABUSE_EXHAUSTION_OBSERVATION_LIMIT + 20; index++) {
    const row = database
      .prepare(nonAiBudgetSql.observeExhaustion)
      .get("observation", 3_600_000, ABUSE_EXHAUSTION_OBSERVATION_LIMIT) as
      | { count: number }
      | undefined;
    if (row) counts.push(row.count);
  }
  assert.equal(counts.length, ABUSE_EXHAUSTION_OBSERVATION_LIMIT);
  assert.equal(counts.at(-1), ABUSE_EXHAUSTION_OBSERVATION_LIMIT);
  assert.deepEqual(counts.filter(shouldEmitAbuseObservation), [1, 10, 100]);
  const lines: string[] = [];
  const line = emitAbuseBudgetObservation("parser", "day", 10, (value) =>
    lines.push(value),
  );
  assert.deepEqual(lines, [line]);
  assert.deepEqual(JSON.parse(line), {
    event: "abuse_budget_exhausted",
    circuit: "parser",
    scope: "day",
    occurrences: 10,
  });
  assert.doesNotMatch(line, /report|session|filename|merchant|amount|secret/);
});
