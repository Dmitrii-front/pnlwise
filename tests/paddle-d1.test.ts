import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  PADDLE_PRICE_ID,
  PADDLE_PRODUCT_ID,
  PADDLE_UNFULFILLABLE_REASON,
  PADDLE_UNFULFILLABLE_STATUS,
} from "../lib/paddle-payment-core";
import { paddleCheckoutSql, paddleFinalizeSql } from "../lib/paddle-d1";

function applyMigration(database: DatabaseSync, name: string) {
  const sql = readFileSync(
    new URL(`../drizzle/${name}`, import.meta.url),
    "utf8",
  );
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
}

function databaseBeforePaymentMigration() {
  const database = new DatabaseSync(":memory:");
  applyMigration(database, "0000_kind_morlun.sql");
  applyMigration(database, "0001_low_madame_hydra.sql");
  return database;
}

function insertReport(
  database: DatabaseSync,
  reportId: string,
  expiresAt: number,
) {
  database
    .prepare(
      "INSERT INTO reports(id,session_hash,data,revision,paid,created_at,expires_at) VALUES(?,?,'{}',0,0,0,?)",
    )
    .run(reportId, "owner", expiresAt);
}

function insertPayment(
  database: DatabaseSync,
  paymentId: string,
  reportId: string,
  transactionId: string,
) {
  database
    .prepare(
      "INSERT INTO payments(id,report_id,paddle_transaction_id,amount,currency,status,created_at) VALUES(?,?,?,1299,'usd','pending',0)",
    )
    .run(paymentId, reportId, transactionId);
}

function finalize(
  database: DatabaseSync,
  paymentId: string,
  reportId: string,
  transactionId: string,
  eventId: string,
  now: number,
) {
  database.exec("BEGIN");
  try {
    database
      .prepare(paddleFinalizeSql.markPaid)
      .run(eventId, paymentId, transactionId, reportId, now);
    database
      .prepare(paddleFinalizeSql.markReportPaid)
      .run(reportId, paymentId, eventId);
    database
      .prepare(paddleFinalizeSql.recordCompleted)
      .run(`payment_completed:${paymentId}`, now, paymentId, eventId);
    database
      .prepare(paddleFinalizeSql.markUnfulfillable)
      .run(
        PADDLE_UNFULFILLABLE_STATUS,
        eventId,
        PADDLE_UNFULFILLABLE_REASON,
        paymentId,
        transactionId,
        reportId,
        now,
      );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

test("payment migration preserves history and backfills one stable Paddle identity", () => {
  const database = databaseBeforePaymentMigration();
  insertReport(database, "report-1", 10_000);
  insertPayment(database, "historical-paid", "report-1", "txn_paid");
  database
    .prepare("UPDATE payments SET status='paid' WHERE id='historical-paid'")
    .run();
  insertPayment(database, "historical-pending", "report-1", "txn_pending");

  applyMigration(database, "0002_high_liz_osborn.sql");

  const rows = database
    .prepare("SELECT id,purchase_key,status FROM payments ORDER BY id")
    .all()
    .map((row) => ({ ...row })) as Array<{
    id: string;
    purchase_key: string | null;
    status: string;
  }>;
  assert.deepEqual(rows, [
    {
      id: "historical-paid",
      purchase_key: `paddle:report-1:${PADDLE_PRODUCT_ID}:${PADDLE_PRICE_ID}`,
      status: "paid",
    },
    {
      id: "historical-pending",
      purchase_key: null,
      status: "pending",
    },
  ]);
  assert.throws(() =>
    database
      .prepare(
        "INSERT INTO payments(id,report_id,purchase_key,amount,currency,status,created_at) VALUES('duplicate','report-1',?,1299,'usd','creating',0)",
      )
      .run(rows[0]!.purchase_key),
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM payments").get()!.count,
    2,
  );
});

test("D1 fulfillment atomically separates deliverable and unfulfillable captures", () => {
  const database = databaseBeforePaymentMigration();
  applyMigration(database, "0002_high_liz_osborn.sql");
  insertReport(database, "valid-report", 2_000);
  insertReport(database, "expired-report", 500);
  insertPayment(database, "valid-payment", "valid-report", "txn_valid");
  insertPayment(database, "expired-payment", "expired-report", "txn_expired");
  insertPayment(database, "deleted-payment", "deleted-report", "txn_deleted");

  finalize(
    database,
    "valid-payment",
    "valid-report",
    "txn_valid",
    "evt_valid",
    1_000,
  );
  finalize(
    database,
    "expired-payment",
    "expired-report",
    "txn_expired",
    "evt_expired",
    1_000,
  );
  finalize(
    database,
    "deleted-payment",
    "deleted-report",
    "txn_deleted",
    "evt_deleted",
    1_000,
  );

  assert.deepEqual(
    {
      ...database
        .prepare("SELECT status,failure_reason FROM payments WHERE id=?")
        .get("valid-payment"),
    },
    { status: "paid", failure_reason: null },
  );
  for (const id of ["expired-payment", "deleted-payment"])
    assert.deepEqual(
      {
        ...database
          .prepare("SELECT status,failure_reason FROM payments WHERE id=?")
          .get(id),
      },
      {
        status: PADDLE_UNFULFILLABLE_STATUS,
        failure_reason: PADDLE_UNFULFILLABLE_REASON,
      },
    );
  assert.equal(
    database.prepare("SELECT paid FROM reports WHERE id='valid-report'").get()!
      .paid,
    1,
  );
  assert.equal(
    database
      .prepare("SELECT paid FROM reports WHERE id='expired-report'")
      .get()!.paid,
    0,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM events WHERE name='payment_completed'",
      )
      .get()!.count,
    1,
  );

  finalize(
    database,
    "valid-payment",
    "valid-report",
    "txn_valid",
    "evt_duplicate",
    1_000,
  );
  finalize(
    database,
    "deleted-payment",
    "deleted-report",
    "txn_deleted",
    "evt_duplicate_unfulfillable",
    1_000,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM events WHERE name='payment_completed'",
      )
      .get()!.count,
    1,
  );
});

test("D1 prevents checkout creation and report deletion from crossing", () => {
  const activeDatabase = databaseBeforePaymentMigration();
  applyMigration(activeDatabase, "0002_high_liz_osborn.sql");
  insertReport(activeDatabase, "active-report", 2_000);
  const purchaseKey = `paddle:active-report:${PADDLE_PRODUCT_ID}:${PADDLE_PRICE_ID}`;
  const claim = activeDatabase
    .prepare(paddleCheckoutSql.insertClaim)
    .run(
      purchaseKey,
      "active-report",
      purchaseKey,
      1299,
      1_000,
      1_000,
      "active-report",
      1_000,
    );
  assert.equal(claim.changes, 1);
  const deletion = activeDatabase
    .prepare(paddleCheckoutSql.deleteOwnedWithoutActive)
    .run("owner", "", "owner", "");
  assert.equal(deletion.changes, 0);
  assert.ok(
    activeDatabase.prepare(paddleCheckoutSql.activeForOwner).get("owner", ""),
  );

  const deletedDatabase = databaseBeforePaymentMigration();
  applyMigration(deletedDatabase, "0002_high_liz_osborn.sql");
  insertReport(deletedDatabase, "deleted-report", 2_000);
  assert.equal(
    deletedDatabase
      .prepare(paddleCheckoutSql.deleteOwnedWithoutActive)
      .run("owner", "", "owner", "").changes,
    1,
  );
  assert.equal(
    deletedDatabase
      .prepare(paddleCheckoutSql.insertClaim)
      .run(
        "deleted-payment",
        "deleted-report",
        `paddle:deleted-report:${PADDLE_PRODUCT_ID}:${PADDLE_PRICE_ID}`,
        1299,
        1_000,
        1_000,
        "deleted-report",
        1_000,
      ).changes,
    0,
  );
});

test("D1 claims a terminal transaction replacement exactly once", () => {
  const database = databaseBeforePaymentMigration();
  applyMigration(database, "0002_high_liz_osborn.sql");
  insertReport(database, "report-1", 2_000);
  const purchaseKey = `paddle:report-1:${PADDLE_PRODUCT_ID}:${PADDLE_PRICE_ID}`;
  database
    .prepare(
      "INSERT INTO payments(id,report_id,paddle_transaction_id,purchase_key,amount,currency,status,created_at) VALUES(?,?,?,?,1299,'usd','pending',0)",
    )
    .run("payment-stable", "report-1", "txn_canceled", purchaseKey);

  const first = database
    .prepare(paddleCheckoutSql.claimReplacement)
    .run(1_000, purchaseKey, "txn_canceled");
  const concurrent = database
    .prepare(paddleCheckoutSql.claimReplacement)
    .run(1_000, purchaseKey, "txn_canceled");

  assert.equal(first.changes, 1);
  assert.equal(concurrent.changes, 0);
  assert.deepEqual(
    {
      ...database
        .prepare(
          "SELECT id,purchase_key,status,paddle_transaction_id,checkout_claimed_at FROM payments WHERE id='payment-stable'",
        )
        .get(),
    },
    {
      id: "payment-stable",
      purchase_key: purchaseKey,
      status: "creating",
      paddle_transaction_id: null,
      checkout_claimed_at: 1_000,
    },
  );
});
