import assert from "node:assert/strict";
import test from "node:test";
import {
  createOperationalReporter,
  sendSentryDiagnostic,
  type MonitoringResult,
} from "../lib/monitoring-core";
import { safeOperationalDiagnostic } from "../lib/operational-diagnostics";

test("unexpected exception is captured once with safe structured metadata", async () => {
  const sent: ReturnType<typeof safeOperationalDiagnostic>[] = [];
  const lines: string[] = [];
  const reporter = createOperationalReporter({
    emit: (line) => lines.push(line),
    send: async (diagnostic) => {
      sent.push(diagnostic);
      return {
        status: "accepted",
        eventId: "a".repeat(32),
        httpStatus: 200,
      };
    },
  });
  const error = Object.assign(new Error("PRIVATE BANK TRANSACTION"), {
    requestBody: { amount: 129900, apiKey: "secret" },
  });
  const diagnostic = {
    code: "REQUEST_FAILED",
    stage: "report.processing",
    route: "api.reports.process",
    retryable: true,
    alertable: true,
  } as const;

  assert.equal((await reporter.report(diagnostic, error)).status, "accepted");
  assert.deepEqual(await reporter.report(diagnostic, error), {
    status: "duplicate",
  });
  assert.equal(sent.length, 1);
  assert.equal(lines.length, 1);
  assert.deepEqual(sent[0], {
    event: "operational_error",
    code: "REQUEST_FAILED",
    stage: "report.processing",
    subsystem: "reports",
    route: "api.reports.process",
    retryable: true,
    alertable: true,
  });
  assert.equal(lines[0].includes("PRIVATE BANK TRANSACTION"), false);
  assert.equal(lines[0].includes("129900"), false);
  assert.equal(lines[0].includes("secret"), false);
});

test("expected user validation is logged safely but not sent to Sentry", async () => {
  let sendCount = 0;
  const reporter = createOperationalReporter({
    emit: () => {},
    send: async () => {
      sendCount++;
      return { status: "failed" };
    },
  });

  assert.deepEqual(
    await reporter.report({
      code: "PARSER_REJECTED_STATEMENT",
      stage: "parser.csv",
      alertable: false,
    }),
    { status: "not_alertable" },
  );
  assert.equal(sendCount, 0);
});

test("Sentry envelope contains only privacy-safe operational fields", async () => {
  let requestUrl = "";
  let requestBody = "";
  const diagnostic = safeOperationalDiagnostic({
    code: "PADDLE_CHECKOUT_CREATE_FAILED",
    stage: "paddle.checkout.create",
    providerRequestId: "req_safe-123456",
    httpStatus: 502,
    retryable: true,
    alertable: true,
    payload: {
      statement: "PRIVATE BANK STATEMENT",
      description: "PRIVATE MERCHANT",
      amount: 129900,
      cookie: "private-cookie",
      authorization: "Bearer private-token",
      webhookSignature: "private-signature",
    },
  } as never);
  const result = await sendSentryDiagnostic(diagnostic, {
    dsn: "https://public@example.test/42",
    environment: "staging",
    eventId: () => "b".repeat(32),
    now: () => new Date("2026-09-18T00:00:00.000Z"),
    fetcher: async (input, init) => {
      requestUrl = String(input);
      requestBody = String(init?.body);
      return new Response(null, { status: 200 });
    },
  });

  assert.deepEqual(result, {
    status: "accepted",
    eventId: "b".repeat(32),
    httpStatus: 200,
  });
  assert.match(requestUrl, /\/api\/42\/envelope/);
  for (const expected of [
    "PADDLE_CHECKOUT_CREATE_FAILED",
    "paddle.checkout.create",
    "payments",
    "api.checkout",
    "req_safe-123456",
    "staging",
  ])
    assert.equal(requestBody.includes(expected), true);
  for (const prohibited of [
    "PRIVATE BANK STATEMENT",
    "PRIVATE MERCHANT",
    "129900",
    "private-cookie",
    "private-token",
    "private-signature",
    '"request"',
    '"breadcrumbs"',
    '"user"',
  ])
    assert.equal(requestBody.includes(prohibited), false);
});

test("provider, webhook, fulfillment, and retention failures stay observable and safe", async () => {
  const sent: ReturnType<typeof safeOperationalDiagnostic>[] = [];
  const reporter = createOperationalReporter({
    emit: () => {},
    send: async (diagnostic) => {
      sent.push(diagnostic);
      return {
        status: "accepted",
        eventId: "c".repeat(32),
        httpStatus: 200,
      };
    },
  });
  const diagnostics = [
    {
      code: "PADDLE_CHECKOUT_CREATE_FAILED",
      stage: "paddle.checkout.create",
      alertable: true,
    },
    {
      code: "PADDLE_WEBHOOK_SIGNATURE_INVALID",
      stage: "paddle.webhook.verification",
      alertable: true,
    },
    {
      code: "PADDLE_FULFILLMENT_VALIDATION_FAILED",
      stage: "paddle.fulfillment.validation",
      alertable: true,
    },
    {
      code: "PADDLE_FULFILLMENT_UNFULFILLABLE",
      stage: "paddle.fulfillment.report",
      alertable: true,
    },
    {
      code: "RETENTION_MAINTENANCE_FAILED",
      stage: "maintenance.retention",
      alertable: true,
    },
    {
      code: "PARSER_INTERNAL_FAILURE",
      stage: "parser.csv.internal",
      alertable: true,
    },
    {
      code: "REPORT_GENERATION_FAILED",
      stage: "report.generation",
      alertable: true,
    },
    {
      code: "EXPORT_GENERATION_FAILED",
      stage: "export.pdf",
      alertable: true,
    },
  ] as const;
  for (const diagnostic of diagnostics)
    assert.equal((await reporter.report(diagnostic)).status, "accepted");

  assert.equal(sent.length, diagnostics.length);
  assert.ok(sent.slice(0, 4).every((item) => item.provider === "paddle"));
  assert.equal(sent[4]?.subsystem, "retention");
  assert.equal(sent[5]?.subsystem, "parsing");
  assert.equal(sent[6]?.subsystem, "reports");
  assert.equal(sent[7]?.subsystem, "exports");
  const serialized = JSON.stringify(sent);
  assert.equal(serialized.includes("signature-value"), false);
  assert.equal(serialized.includes("request-body"), false);
});

test("Sentry absence, invalid configuration, rejection, or failure never throws", async () => {
  const diagnostic = safeOperationalDiagnostic({
    code: "REQUEST_FAILED",
    stage: "api.request",
    alertable: true,
  });
  const cases: Promise<MonitoringResult>[] = [
    sendSentryDiagnostic(diagnostic, {}),
    sendSentryDiagnostic(diagnostic, { dsn: "not-a-dsn" }),
    sendSentryDiagnostic(diagnostic, {
      dsn: "https://public@example.test/42",
      eventId: () => "d".repeat(32),
      fetcher: async () => new Response(null, { status: 503 }),
    }),
    sendSentryDiagnostic(diagnostic, {
      dsn: "https://public@example.test/42",
      eventId: () => "e".repeat(32),
      fetcher: async () => {
        throw new Error("network unavailable");
      },
    }),
  ];
  assert.deepEqual(
    (await Promise.all(cases)).map((result) => result.status),
    ["disabled", "invalid", "rejected", "failed"],
  );
});
