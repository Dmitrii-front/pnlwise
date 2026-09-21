import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  AI_CLASSIFICATION_BATCH_SIZE,
  AI_GLOBAL_DAILY_CALL_LIMIT,
  AI_GLOBAL_HOURLY_CALL_LIMIT,
  AI_IP_HOURLY_CALL_LIMIT,
  AI_REPORT_CALL_LIMIT,
  AI_SESSION_HOURLY_CALL_LIMIT,
  aiBudgetAcquireBindings,
  aiBudgetEntries,
  aiBudgetSql,
  exhaustedAiBudget,
  type AiBudgetEntry,
  type AiBudgetReason,
} from "../lib/ai-budget";
import {
  AI_BUDGET_WARNING,
  AI_FAILURE_WARNING,
  runAiCategorization,
} from "../lib/ai-core";
import { classify, needsReview, type Transaction } from "../lib/domain";
import { parseCsv } from "../lib/parsing";

function budgetDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(
    "CREATE TABLE rate_limits(key text PRIMARY KEY NOT NULL,count integer NOT NULL,expires_at integer NOT NULL)",
  );
  return database;
}

function entries(
  attempt: number,
  overrides: Partial<{
    reportId: string;
    sessionHash: string;
    ipHash: string;
    now: number;
  }> = {},
) {
  return aiBudgetEntries({
    reportId: overrides.reportId || `report-${attempt}`,
    sessionHash: overrides.sessionHash || `session-${attempt}`,
    ipHash: overrides.ipHash || `ip-${attempt}`,
    now: overrides.now ?? 1_800_000,
  });
}

function claim(database: DatabaseSync, budgets: AiBudgetEntry[]) {
  const acquired = database
    .prepare(aiBudgetSql.acquire)
    .all(...aiBudgetAcquireBindings(budgets)) as unknown as Array<{
    key: string;
    count: number;
  }>;
  if (acquired.length === budgets.length) return null;
  const counts = database
    .prepare(aiBudgetSql.counts)
    .all(...budgets.map((budget) => budget.key)) as unknown as Array<{
    key: string;
    count: number;
  }>;
  return exhaustedAiBudget(budgets, counts);
}

function transaction(index: number): Transaction {
  return {
    ...classify(
      parseCsv(
        `Date,Description,Amount\n01/15/2026,UNKNOWN VENDOR ${index},-25`,
        "statement",
        { convention: "credit-positive" },
      )[0],
    ),
    id: `transaction-${index}`,
  };
}

function providerResponse(transactions: Transaction[]) {
  return new Response(
    JSON.stringify({
      status: "completed",
      output_text: JSON.stringify({
        items: transactions.map((item) => ({
          id: item.id,
          merchant: "Unknown Vendor",
          categoryId: "office",
          transactionType: "expense",
          confidence: 0.9,
          reason: "Likely office expense.",
        })),
      }),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function categorizeWithBudget(input: {
  transactions: Transaction[];
  beforeRequest: () => Promise<AiBudgetReason | null>;
  calls: { count: number };
}) {
  return runAiCategorization({
    transactions: input.transactions,
    businessType: "Other",
    apiKey: "test-key",
    model: "test-model",
    beforeRequest: input.beforeRequest,
    fetcher: async () => {
      input.calls.count++;
      return providerResponse(input.transactions);
    },
    report: async () => undefined,
  });
}

test("QA-sized reports retain two normal AI classification batches", async () => {
  const database = budgetDatabase();
  const transactions = Array.from({ length: 56 }, (_, index) => transaction(index));
  const calls = { count: 0 };
  const reportBudget = entries(1, {
    reportId: "qa-report",
    sessionHash: "qa-session",
    ipHash: "qa-ip",
  });

  for (let cursor = 0; cursor < transactions.length; cursor += AI_CLASSIFICATION_BATCH_SIZE) {
    const batch = transactions.slice(cursor, cursor + AI_CLASSIFICATION_BATCH_SIZE);
    const result = await categorizeWithBudget({
      transactions: batch,
      beforeRequest: async () => claim(database, reportBudget),
      calls,
    });
    assert.equal(result.warning, undefined);
    assert.equal(result.transactions.every((item) => item.categoryId === "office"), true);
  }
  assert.equal(calls.count, 2);
  assert.equal(Math.ceil(56 / AI_CLASSIFICATION_BATCH_SIZE), AI_REPORT_CALL_LIMIT);
});

test("per-report budget persists across repeated processing attempts", () => {
  const database = budgetDatabase();
  const reportBudget = entries(1, {
    reportId: "same-report",
    sessionHash: "same-session",
    ipHash: "same-ip",
  });
  assert.equal(claim(database, reportBudget), null);
  assert.equal(claim(database, reportBudget), null);
  assert.equal(claim(database, reportBudget), "report");

  const counts = database
    .prepare("SELECT key,count FROM rate_limits")
    .all() as unknown as Array<{ key: string; count: number }>;
  assert.equal(Math.max(...counts.map((row) => row.count)), AI_REPORT_CALL_LIMIT);
});

test("large reports stop at the report ceiling and preserve manual Review data", async () => {
  const database = budgetDatabase();
  const transactions = Array.from({ length: 120 }, (_, index) => transaction(index));
  const original = structuredClone(transactions);
  const calls = { count: 0 };
  const reportBudget = entries(1, {
    reportId: "large-report",
    sessionHash: "large-session",
    ipHash: "large-ip",
  });
  let fallback: Awaited<ReturnType<typeof categorizeWithBudget>> | undefined;

  for (let cursor = 0; cursor < transactions.length; cursor += AI_CLASSIFICATION_BATCH_SIZE) {
    const batch = transactions.slice(cursor, cursor + AI_CLASSIFICATION_BATCH_SIZE);
    const result = await categorizeWithBudget({
      transactions: batch,
      beforeRequest: async () => claim(database, reportBudget),
      calls,
    });
    if (result.warning) {
      fallback = result;
      break;
    }
  }

  assert.equal(calls.count, AI_REPORT_CALL_LIMIT);
  assert.equal(fallback?.warning, AI_BUDGET_WARNING);
  assert.deepEqual(fallback?.transactions, original.slice(80, 120));
  assert.equal(fallback?.transactions.every(needsReview), true);
  for (const [index, item] of (fallback?.transactions || []).entries()) {
    const source = original[index + 80];
    assert.deepEqual(
      [item.amount, item.date, item.direction, item.currency],
      [source.amount, source.date, source.direction, source.currency],
    );
  }
});

test("session and IP ceilings block without consuming another budget", () => {
  const sessionDatabase = budgetDatabase();
  for (let index = 0; index < AI_SESSION_HOURLY_CALL_LIMIT; index++)
    assert.equal(
      claim(sessionDatabase, entries(index, { sessionHash: "one-session" })),
      null,
    );
  assert.equal(
    claim(
      sessionDatabase,
      entries(AI_SESSION_HOURLY_CALL_LIMIT, { sessionHash: "one-session" }),
    ),
    "session",
  );

  const ipDatabase = budgetDatabase();
  for (let index = 0; index < AI_IP_HOURLY_CALL_LIMIT; index++)
    assert.equal(claim(ipDatabase, entries(index, { ipHash: "one-ip" })), null);
  assert.equal(
    claim(ipDatabase, entries(AI_IP_HOURLY_CALL_LIMIT, { ipHash: "one-ip" })),
    "ip",
  );
});

test("global hourly and daily ceilings block provider reservations", () => {
  const hourlyDatabase = budgetDatabase();
  for (let index = 0; index < AI_GLOBAL_HOURLY_CALL_LIMIT; index++)
    assert.equal(claim(hourlyDatabase, entries(index)), null);
  assert.equal(
    claim(hourlyDatabase, entries(AI_GLOBAL_HOURLY_CALL_LIMIT)),
    "global_hourly",
  );

  const dailyDatabase = budgetDatabase();
  for (let index = 0; index < AI_GLOBAL_DAILY_CALL_LIMIT; index++) {
    const hour = Math.floor(index / AI_GLOBAL_HOURLY_CALL_LIMIT);
    assert.equal(
      claim(dailyDatabase, entries(index, { now: hour * 3_600_000 })),
      null,
    );
  }
  assert.equal(
    claim(
      dailyDatabase,
      entries(AI_GLOBAL_DAILY_CALL_LIMIT, { now: 5 * 3_600_000 }),
    ),
    "global_daily",
  );
});

test("session, IP, and global exhaustion never reaches the provider", async () => {
  const cases: Array<{
    reason: AiBudgetReason;
    database: DatabaseSync;
    blocked: AiBudgetEntry[];
    code: string;
  }> = [];

  const sessionDatabase = budgetDatabase();
  for (let index = 0; index < AI_SESSION_HOURLY_CALL_LIMIT; index++)
    claim(sessionDatabase, entries(index, { sessionHash: "blocked-session" }));
  cases.push({
    reason: "session",
    database: sessionDatabase,
    blocked: entries(1000, { sessionHash: "blocked-session" }),
    code: "AI_BUDGET_SESSION_EXHAUSTED",
  });

  const ipDatabase = budgetDatabase();
  for (let index = 0; index < AI_IP_HOURLY_CALL_LIMIT; index++)
    claim(ipDatabase, entries(index, { ipHash: "blocked-ip" }));
  cases.push({
    reason: "ip",
    database: ipDatabase,
    blocked: entries(1000, { ipHash: "blocked-ip" }),
    code: "AI_BUDGET_IP_EXHAUSTED",
  });

  const hourlyDatabase = budgetDatabase();
  for (let index = 0; index < AI_GLOBAL_HOURLY_CALL_LIMIT; index++)
    claim(hourlyDatabase, entries(index));
  cases.push({
    reason: "global_hourly",
    database: hourlyDatabase,
    blocked: entries(1000),
    code: "AI_BUDGET_GLOBAL_HOURLY_EXHAUSTED",
  });

  const dailyDatabase = budgetDatabase();
  for (let index = 0; index < AI_GLOBAL_DAILY_CALL_LIMIT; index++) {
    const hour = Math.floor(index / AI_GLOBAL_HOURLY_CALL_LIMIT);
    claim(dailyDatabase, entries(index, { now: hour * 3_600_000 }));
  }
  cases.push({
    reason: "global_daily",
    database: dailyDatabase,
    blocked: entries(1000, { now: 5 * 3_600_000 }),
    code: "AI_BUDGET_GLOBAL_DAILY_EXHAUSTED",
  });

  for (const expected of cases) {
    let providerCalls = 0;
    const diagnostics: string[] = [];
    const result = await runAiCategorization({
      transactions: [transaction(1)],
      businessType: "Other",
      apiKey: "test-key",
      model: "test-model",
      beforeRequest: async () => claim(expected.database, expected.blocked),
      fetcher: async () => {
        providerCalls++;
        return providerResponse([transaction(1)]);
      },
      report: async (diagnostic) => {
        diagnostics.push(diagnostic.code);
      },
    });
    assert.equal(providerCalls, 0, expected.reason);
    assert.equal(result.warning, AI_BUDGET_WARNING, expected.reason);
    assert.deepEqual(diagnostics, [expected.code], expected.reason);
  }
});

test("concurrent global reservations cannot exceed the hourly ceiling", async () => {
  const database = budgetDatabase();
  const results = await Promise.all(
    Array.from({ length: AI_GLOBAL_HOURLY_CALL_LIMIT + 20 }, async (_, index) => {
      await Promise.resolve();
      return claim(database, entries(index));
    }),
  );
  assert.equal(results.filter((result) => result === null).length, AI_GLOBAL_HOURLY_CALL_LIMIT);
  assert.equal(results.filter((result) => result === "global_hourly").length, 20);
  const global = database
    .prepare("SELECT count FROM rate_limits WHERE key LIKE 'ai:global:hour:%'")
    .get() as { count: number };
  assert.equal(global.count, AI_GLOBAL_HOURLY_CALL_LIMIT);
});

test("candidate-free batches consume no AI budget and make no provider request", async () => {
  const item = transaction(1);
  item.userConfirmed = true;
  const calls = { budget: 0, provider: 0 };
  const result = await runAiCategorization({
    transactions: [item],
    businessType: "Other",
    apiKey: "test-key",
    model: "test-model",
    beforeRequest: async () => {
      calls.budget++;
      return null;
    },
    fetcher: async () => {
      calls.provider++;
      return providerResponse([item]);
    },
    report: async () => undefined,
  });
  assert.equal(result.warning, undefined);
  assert.deepEqual(result.transactions, [item]);
  assert.deepEqual(calls, { budget: 0, provider: 0 });
});

test("provider failures retain the existing safe fallback behavior", async () => {
  const item = transaction(1);
  const diagnostics: string[] = [];
  const result = await runAiCategorization({
    transactions: [item],
    businessType: "Other",
    apiKey: "test-key",
    model: "test-model",
    beforeRequest: async () => null,
    fetcher: async () => new Response("{}", { status: 503 }),
    report: async (diagnostic) => {
      diagnostics.push(diagnostic.code);
    },
  });
  assert.equal(result.warning, AI_FAILURE_WARNING);
  assert.deepEqual(result.transactions, [item]);
  assert.deepEqual(diagnostics, ["OPENAI_PROVIDER_FAILED"]);
});
