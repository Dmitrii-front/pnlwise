import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  invokeRetentionMaintenance,
  maintenanceAuthorized,
  retentionSql,
  runRetentionCleanup,
  type RetentionDiagnostic,
  type RetentionStore,
} from "../lib/retention";

class MemoryRetentionStore implements RetentionStore {
  expired: string[];
  auxiliaryRuns = 0;

  constructor(count: number) {
    this.expired = Array.from(
      { length: count },
      (_, index) => `report-${index}`,
    );
  }

  async deleteExpiredReports(_now: number, limit: number) {
    return this.expired.splice(0, limit).length;
  }

  async hasExpiredReports() {
    return this.expired.length > 0;
  }

  async cleanupAuxiliary() {
    this.auxiliaryRuns++;
  }
}

function applyMigration(database: DatabaseSync, name: string) {
  const sql = readFileSync(
    new URL(`../drizzle/${name}`, import.meta.url),
    "utf8",
  );
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
}

function retentionDatabase() {
  const database = new DatabaseSync(":memory:");
  applyMigration(database, "0000_kind_morlun.sql");
  applyMigration(database, "0001_low_madame_hydra.sql");
  applyMigration(database, "0002_high_liz_osborn.sql");
  return database;
}

function insertReport(database: DatabaseSync, id: string, expiresAt: number) {
  database
    .prepare(
      "INSERT INTO reports(id,session_hash,data,revision,paid,created_at,expires_at) VALUES(?,?,'{}',0,0,0,?)",
    )
    .run(id, `owner-${id}`, expiresAt);
}

test("idle retention cleanup is bounded and idempotent", async () => {
  const store = new MemoryRetentionStore(0);
  assert.deepEqual(await runRetentionCleanup(store, 1_000), {
    removed: 0,
    batches: 1,
    remaining: false,
  });
  assert.deepEqual(await runRetentionCleanup(store, 1_000), {
    removed: 0,
    batches: 1,
    remaining: false,
  });
  assert.equal(store.auxiliaryRuns, 2);
});

test("retention drains full batches and repeated runs remain idempotent", async () => {
  const store = new MemoryRetentionStore(250);
  assert.deepEqual(await runRetentionCleanup(store, 1_000), {
    removed: 250,
    batches: 3,
    remaining: false,
  });
  assert.deepEqual(await runRetentionCleanup(store, 1_000), {
    removed: 0,
    batches: 1,
    remaining: false,
  });

  const exactBatch = new MemoryRetentionStore(100);
  assert.deepEqual(await runRetentionCleanup(exactBatch, 1_000), {
    removed: 100,
    batches: 2,
    remaining: false,
  });

  const boundedBacklog = new MemoryRetentionStore(1_001);
  assert.deepEqual(await runRetentionCleanup(boundedBacklog, 1_000), {
    removed: 1_000,
    batches: 10,
    remaining: true,
  });
});

test("retention protects active payable reports and preserves payment records", () => {
  const database = retentionDatabase();
  insertReport(database, "expired", 500);
  insertReport(database, "active", 500);
  insertReport(database, "creating", 500);
  insertReport(database, "paid", 500);
  insertReport(database, "captured-unfulfillable", 500);
  insertReport(database, "not-expired", 1_500);
  database
    .prepare(
      "INSERT INTO payments(id,report_id,purchase_key,amount,currency,status,created_at) VALUES(?,?,?,?,?,?,0)",
    )
    .run("payment-active", "active", "purchase-active", 1299, "usd", "pending");
  database
    .prepare(
      "INSERT INTO payments(id,report_id,purchase_key,amount,currency,status,created_at) VALUES(?,?,?,?,?,?,0)",
    )
    .run("payment-paid", "paid", "purchase-paid", 1299, "usd", "paid");
  database
    .prepare(
      "INSERT INTO payments(id,report_id,paddle_transaction_id,paddle_event_id,purchase_key,amount,currency,status,failure_reason,created_at) VALUES(?,?,?,?,?,?,?,?,?,0)",
    )
    .run(
      "payment-captured-unfulfillable",
      "captured-unfulfillable",
      "txn-retention-audit",
      "evt-retention-audit",
      "purchase-captured-unfulfillable",
      1299,
      "usd",
      "captured_unfulfillable",
      "report_expired",
    );
  database
    .prepare(
      "INSERT INTO payments(id,report_id,purchase_key,amount,currency,status,created_at) VALUES(?,?,?,?,?,?,0)",
    )
    .run(
      "payment-creating",
      "creating",
      "purchase-creating",
      1299,
      "usd",
      "creating",
    );
  database
    .prepare("INSERT INTO events(id,name,metadata,created_at) VALUES(?,?,?,?)")
    .run("old-analytics", "report_viewed", "{}", 0);
  database
    .prepare("INSERT INTO events(id,name,metadata,created_at) VALUES(?,?,?,?)")
    .run("payment-audit", "payment_completed", "{}", 0);

  const result = database
    .prepare(retentionSql.deleteExpiredReports)
    .run(1_000, 100);

  assert.equal(result.changes, 3);
  assert.deepEqual(
    database
      .prepare("SELECT id FROM reports ORDER BY id")
      .all()
      .map((row) => row.id),
    ["active", "creating", "not-expired"],
  );
  assert.deepEqual(
    database
      .prepare("SELECT id,status FROM payments ORDER BY id")
      .all()
      .map((row) => ({ ...row })),
    [
      {
        id: "payment-active",
        status: "pending",
      },
      {
        id: "payment-captured-unfulfillable",
        status: "captured_unfulfillable",
      },
      { id: "payment-creating", status: "creating" },
      { id: "payment-paid", status: "paid" },
    ],
  );
  assert.deepEqual(
    {
      ...database
        .prepare(
          "SELECT paddle_transaction_id,paddle_event_id,failure_reason FROM payments WHERE id='payment-captured-unfulfillable'",
        )
        .get(),
    },
    {
      paddle_transaction_id: "txn-retention-audit",
      paddle_event_id: "evt-retention-audit",
      failure_reason: "report_expired",
    },
  );
  database.prepare(retentionSql.deleteExpiredAnalytics).run(1_000);
  assert.deepEqual(
    database
      .prepare("SELECT id,name FROM events ORDER BY id")
      .all()
      .map((row) => ({ ...row })),
    [{ id: "payment-audit", name: "payment_completed" }],
  );
});

test("unauthorized maintenance invocation fails closed", () => {
  const secret = "a-secure-maintenance-secret-value-123";
  assert.equal(maintenanceAuthorized(null, secret), false);
  assert.equal(maintenanceAuthorized(`Bearer wrong-${secret}`, secret), false);
  assert.equal(maintenanceAuthorized(`Bearer ${secret}`, undefined), false);
  assert.equal(maintenanceAuthorized("Bearer too-short", "too-short"), false);
  assert.equal(maintenanceAuthorized(`Bearer ${secret}`, secret), true);
});

test("authenticated maintenance invocation succeeds with privacy-safe diagnostics", async () => {
  const secret = "a-secure-maintenance-secret-value-123";
  const diagnostics: RetentionDiagnostic[] = [];
  let cleanupRuns = 0;
  const result = await invokeRetentionMaintenance(
    `Bearer ${secret}`,
    secret,
    async () => {
      cleanupRuns++;
      return { removed: 125, batches: 2, remaining: false };
    },
    (entry) => diagnostics.push(entry),
  );

  assert.deepEqual(result, {
    status: 200,
    result: { removed: 125, batches: 2, remaining: false },
  });
  assert.equal(cleanupRuns, 1);
  assert.deepEqual(diagnostics, [
    {
      event: "retention_cleanup_started",
      stage: "maintenance.retention",
    },
    {
      event: "retention_cleanup_completed",
      stage: "maintenance.retention",
      removed: 125,
      batches: 2,
      remaining: false,
    },
  ]);
});

test("maintenance invocation rejects authentication before cleanup", async () => {
  const secret = "a-secure-maintenance-secret-value-123";
  let cleanupRuns = 0;
  const cleanup = async () => {
    cleanupRuns++;
    return { removed: 0, batches: 1, remaining: false };
  };
  const diagnostic = () =>
    assert.fail("unauthorized cleanup emitted diagnostics");

  assert.deepEqual(
    await invokeRetentionMaintenance(null, secret, cleanup, diagnostic),
    { status: 401 },
  );
  assert.deepEqual(
    await invokeRetentionMaintenance(
      `Bearer ${secret}`,
      "invalid",
      cleanup,
      diagnostic,
    ),
    { status: 503 },
  );
  assert.equal(cleanupRuns, 0);
});

test("maintenance failure emits a stable privacy-safe diagnostic", async () => {
  const secret = "a-secure-maintenance-secret-value-123";
  const diagnostics: RetentionDiagnostic[] = [];

  await assert.rejects(
    invokeRetentionMaintenance(
      `Bearer ${secret}`,
      secret,
      async () => {
        throw new Error("synthetic failure");
      },
      (entry) => diagnostics.push(entry),
    ),
    /synthetic failure/,
  );
  assert.deepEqual(diagnostics, [
    {
      event: "retention_cleanup_started",
      stage: "maintenance.retention",
    },
    {
      event: "retention_cleanup_failed",
      stage: "maintenance.retention",
      code: "RETENTION_MAINTENANCE_FAILED",
    },
  ]);
});
