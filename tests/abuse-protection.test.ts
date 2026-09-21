import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  boundedFormData,
  EXPORT_RATE_LIMIT,
  EXPORT_RATE_WINDOW_SECONDS,
  MAX_API_BODY_BYTES,
  rateLimitSql,
  readBoundedRequestBody,
  readBoundedRequestText,
  reportProcessingLockKey,
  reportProcessingLockSql,
  RequestBodyTooLargeError,
} from "../lib/abuse-protection";

function streamedRequest(
  path: string,
  chunks: Uint8Array[],
  headers: HeadersInit = {},
) {
  return new Request(`https://pnlwise.test${path}`, {
    method: "POST",
    headers,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
}

test("bounded text reader accepts normal JSON under the API limit", async () => {
  const payload = JSON.stringify({ name: "landing_view" });
  const raw = await readBoundedRequestText(
    new Request("https://pnlwise.test/api/events", {
      method: "POST",
      body: payload,
    }),
    MAX_API_BODY_BYTES,
  );
  assert.deepEqual(JSON.parse(raw), { name: "landing_view" });
});

test("bounded text reader rejects JSON over the API limit", async () => {
  const payload = JSON.stringify({ value: "a".repeat(MAX_API_BODY_BYTES) });
  await assert.rejects(
    readBoundedRequestText(
      new Request("https://pnlwise.test/api/events", {
        method: "POST",
        body: payload,
      }),
      MAX_API_BODY_BYTES,
    ),
    RequestBodyTooLargeError,
  );
});

test("bounded text reader rejects streamed bytes without Content-Length", async () => {
  await assert.rejects(
    readBoundedRequestText(
      streamedRequest("/api/events", [
        new Uint8Array(MAX_API_BODY_BYTES),
        new Uint8Array(1),
      ]),
      MAX_API_BODY_BYTES,
    ),
    RequestBodyTooLargeError,
  );
});

test("actual bytes override understated or malformed Content-Length", async () => {
  for (const contentLength of ["1", "not-a-number"]) {
    await assert.rejects(
      readBoundedRequestText(
        streamedRequest(
          "/api/events",
          [new Uint8Array(MAX_API_BODY_BYTES + 1)],
          { "Content-Length": contentLength },
        ),
        MAX_API_BODY_BYTES,
      ),
      RequestBodyTooLargeError,
    );
  }
});

test("overstated Content-Length is rejected before the body stream is read", async () => {
  let pulled = false;
  const request = new Request("https://pnlwise.test/api/events", {
    method: "POST",
    headers: { "Content-Length": String(MAX_API_BODY_BYTES + 1) },
    body: new ReadableStream({
      pull(controller) {
        pulled = true;
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      },
    }, { highWaterMark: 0 }),
    duplex: "half",
  } as RequestInit);
  await assert.rejects(
    readBoundedRequestText(request, MAX_API_BODY_BYTES),
    RequestBodyTooLargeError,
  );
  assert.equal(pulled, false);
});

test("API limit counts UTF-8 bytes instead of JavaScript characters", async () => {
  const payload = JSON.stringify({ value: "é".repeat(60_000) });
  assert.ok(payload.length < MAX_API_BODY_BYTES);
  assert.ok(new TextEncoder().encode(payload).byteLength > MAX_API_BODY_BYTES);
  await assert.rejects(
    readBoundedRequestText(
      streamedRequest("/api/events", [new TextEncoder().encode(payload)]),
      MAX_API_BODY_BYTES,
    ),
    RequestBodyTooLargeError,
  );
});

test("webhook raw body is preserved and oversized webhook streams are rejected", async () => {
  const payload = '{\n  "event_type": "transaction.completed",\n  "note": "café"\n}\n';
  for (const path of ["/api/paddle/webhook", "/api/stripe/webhook"]) {
    assert.equal(
      await readBoundedRequestText(
        streamedRequest(path, [new TextEncoder().encode(payload)]),
        MAX_API_BODY_BYTES,
      ),
      payload,
    );
    await assert.rejects(
      readBoundedRequestText(
        streamedRequest(path, [new Uint8Array(MAX_API_BODY_BYTES + 1)]),
        MAX_API_BODY_BYTES,
      ),
      RequestBodyTooLargeError,
    );
  }
});

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
