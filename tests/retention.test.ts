import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  maintenanceAuthorized,
  retentionSql,
  runRetentionCleanup,
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
  insertReport(database, "paid", 500);
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
    .prepare("INSERT INTO events(id,name,metadata,created_at) VALUES(?,?,?,?)")
    .run("old-analytics", "report_viewed", "{}", 0);
  database
    .prepare("INSERT INTO events(id,name,metadata,created_at) VALUES(?,?,?,?)")
    .run("payment-audit", "payment_completed", "{}", 0);

  const result = database
    .prepare(retentionSql.deleteExpiredReports)
    .run(1_000, 100);

  assert.equal(result.changes, 2);
  assert.deepEqual(
    database
      .prepare("SELECT id FROM reports ORDER BY id")
      .all()
      .map((row) => row.id),
    ["active"],
  );
  assert.deepEqual(
    database
      .prepare("SELECT id,status FROM payments ORDER BY id")
      .all()
      .map((row) => ({ ...row })),
    [
      { id: "payment-active", status: "pending" },
      { id: "payment-paid", status: "paid" },
    ],
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
