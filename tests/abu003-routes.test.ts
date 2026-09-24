import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function ordered(value: string, fragments: string[]) {
  let position = -1;
  for (const fragment of fragments) {
    const next = value.indexOf(fragment, position + 1);
    assert.notEqual(next, -1, `missing ${fragment}`);
    assert.ok(next > position, `${fragment} is out of order`);
    position = next;
  }
}

test("report admission precedes global reservation and opportunistic cleanup", () => {
  const route = source("app/api/reports/route.ts");
  ordered(route, [
    "sessionRate(req, \"create\", 15)",
    "body(req)",
    'requireNonAiBudget("report_create")',
    "persistWithGrowthReservation",
    "cleanupExpired()",
    "INSERT INTO reports",
  ]);
});

test("upload establishes ownership and limits before reserving parser work", () => {
  const route = source("app/api/statements/upload/route.ts");
  ordered(route, [
    'sessionRate(req, "upload", 80)',
    "boundedFormData(req, MAX_UPLOAD_BODY_BYTES)",
    "getReport(String(form.get(\"reportId\") || \"\"))",
    "report.statements.length >= 24",
    'requireNonAiBudget("parser")',
    "file.arrayBuffer()",
    "sha256(bytes)",
    "parseCsv(",
  ]);
  assert.match(route, /MAX_REPORT_TRANSACTIONS/);
});

test("processing reserves only after no-op and ownership checks and keeps AI separate", () => {
  const route = source("app/api/reports/[id]/process/route.ts");
  const secondGet = route.lastIndexOf("report = await getReport(id)");
  const secondNoop = route.indexOf("input.stage !== report.stage", secondGet);
  const completeNoop = route.indexOf("report.stage >= 6", secondNoop);
  const reserve = route.indexOf('requireNonAiBudget("process")', completeNoop);
  const work = route.indexOf("switch (report.stage)", reserve);
  assert.ok(secondGet >= 0 && secondNoop > secondGet);
  assert.ok(completeNoop > secondNoop && reserve > completeNoop && work > reserve);
  assert.match(route, /aiCategorize\([\s\S]*claimAiBudget\(req, id\)/);
});

test("recalculate and split reuse edit admission and split preserves the transaction cap", () => {
  const recalculate = source("app/api/reports/[id]/recalculate/route.ts");
  const split = source("app/api/reports/[id]/split/route.ts");
  assert.match(recalculate, /sessionRate\(req, "edit", 500\)/);
  assert.match(split, /sessionRate\(req, "edit", 500\)/);
  ordered(split, [
    "report.transactions = report.transactions.flatMap",
    "report.transactions.length > MAX_REPORT_TRANSACTIONS",
    "saveReport(report)",
  ]);
});

test("export rate admission precedes report loading and entitlement work", () => {
  const route = source("app/api/reports/[id]/export/[format]/route.ts");
  ordered(route, [
    '["pdf", "xlsx", "csv"].includes(format)',
    "sessionRate(",
    "getReport(id)",
    "exportAccess(report)",
    "pdfExport(report)",
  ]);
});

test("public analytics drops globally rejected events before insertion", () => {
  const route = source("app/api/events/route.ts");
  ordered(route, [
    "body(req)",
    "rateLimit(",
    'reserveNonAiBudget("public_events")',
    "if (!admitted) return json({ ok: true })",
    "track(data.name",
  ]);
  assert.doesNotMatch(route, /track\([^)]*drop|reportOperationalError|Sentry/i);
});

test("existing reads, webhooks, maintenance, deletion, and exports avoid global new-work circuits", () => {
  for (const path of [
    "app/api/reports/[id]/route.ts",
    "app/api/paddle/webhook/route.ts",
    "app/api/maintenance/route.ts",
    "app/api/session/data/route.ts",
  ])
    assert.doesNotMatch(source(path), /requireNonAiBudget|reserveNonAiBudget/);
});

test("invalid Paddle signatures are expected 400 responses without alertable diagnostics", () => {
  const route = source("app/api/paddle/webhook/route.ts");
  assert.match(route, /throw new AppError\("Invalid Paddle webhook\.", 400\)/);
  assert.doesNotMatch(route, /PADDLE_WEBHOOK_SIGNATURE_INVALID/);
  assert.match(route, /fulfillPaddleTransaction/);
});

test("report persistence retains the absolute cap and positive-growth reservation", () => {
  const server = source("lib/server.ts");
  assert.match(server, /MAX_REPORT_DATA_BYTES = 1_800_000/);
  ordered(server, [
    "nextBytes > MAX_REPORT_DATA_BYTES",
    "length(CAST(data AS BLOB)) AS data_bytes",
    "persistWithGrowthReservation",
    "UPDATE reports SET data=?",
  ]);
});
