import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  boundedFormData,
  EXPORT_RATE_LIMIT,
  EXPORT_RATE_WINDOW_SECONDS,
  rateLimitSql,
  readBoundedRequestBody,
  reportProcessingLockKey,
  reportProcessingLockSql,
  RequestBodyTooLargeError,
} from "../lib/abuse-protection";

test("upload body limit rejects an oversized stream without Content-Length", async () => {
  let canceled = false;
  const request = new Request("https://pnlwise.test/api/statements/upload", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(5));
      },
      cancel() {
        canceled = true;
      },
    }),
    duplex: "half",
  } as RequestInit);

  await assert.rejects(
    readBoundedRequestBody(request, 10),
    RequestBodyTooLargeError,
  );
  assert.equal(canceled, true);
});

test("upload body limit rejects a false Content-Length and accepts bounded multipart", async () => {
  const oversized = new Request("https://pnlwise.test/api/statements/upload", {
    method: "POST",
    headers: { "Content-Length": "1" },
    body: new Uint8Array(11),
  });
  await assert.rejects(
    readBoundedRequestBody(oversized, 10),
    RequestBodyTooLargeError,
  );

  const source = new FormData();
  source.set("reportId", "report-1");
  source.set("file", new File(["date,description,amount\n"], "bank.csv"));
  const form = await boundedFormData(
    new Request("https://pnlwise.test/api/statements/upload", {
      method: "POST",
      body: source,
    }),
    1024,
  );
  assert.equal(form.get("reportId"), "report-1");
  assert.equal((form.get("file") as File).name, "bank.csv");
});

function protectionDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(
    "CREATE TABLE rate_limits(key text PRIMARY KEY NOT NULL,count integer NOT NULL,expires_at integer NOT NULL)",
  );
  return database;
}

test("export rate-limit bucket enforces the configured conservative limit", () => {
  const database = protectionDatabase();
  let count = 0;
  for (let request = 0; request <= EXPORT_RATE_LIMIT; request++) {
    count = Number(
      database
        .prepare(rateLimitSql.increment)
        .get("export:session:bucket", EXPORT_RATE_WINDOW_SECONDS * 1000)!.count,
    );
  }
  assert.equal(count, EXPORT_RATE_LIMIT + 1);
  assert.ok(count > EXPORT_RATE_LIMIT);
});

test("processing lease admits one owner, releases safely, and permits retry", () => {
  const database = protectionDatabase();
  const key = reportProcessingLockKey("report-1");
  const acquire = (owner: number, now: number, expiresAt: number) =>
    database
      .prepare(reportProcessingLockSql.acquire)
      .get(key, owner, expiresAt, now);

  assert.equal(acquire(101, 1_000, 121_000)!.count, 101);
  assert.equal(acquire(202, 1_001, 121_001), undefined);
  assert.equal(
    database.prepare(reportProcessingLockSql.release).run(key, 202, 121_001)
      .changes,
    0,
  );
  assert.equal(
    database.prepare(reportProcessingLockSql.release).run(key, 101, 121_000)
      .changes,
    1,
  );
  assert.equal(acquire(202, 1_002, 121_002)!.count, 202);
});

test("processing lease reclaims a stale lock and old owners cannot release it", () => {
  const database = protectionDatabase();
  const key = reportProcessingLockKey("report-1");
  const acquire = (owner: number, now: number, expiresAt: number) =>
    database
      .prepare(reportProcessingLockSql.acquire)
      .get(key, owner, expiresAt, now);

  assert.equal(acquire(101, 1_000, 2_000)!.count, 101);
  assert.equal(acquire(202, 2_000, 122_000)!.count, 202);
  assert.equal(
    database.prepare(reportProcessingLockSql.release).run(key, 101, 2_000)
      .changes,
    0,
  );
  assert.equal(
    database.prepare(reportProcessingLockSql.release).run(key, 202, 122_000)
      .changes,
    1,
  );
  assert.equal(acquire(303, 2_001, 122_001)!.count, 303);
});
