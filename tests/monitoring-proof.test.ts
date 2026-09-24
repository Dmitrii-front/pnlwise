import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  executeMonitoringProof,
  PRODUCTION_PROOF_FINGERPRINT,
  PRODUCTION_PROOF_HEADER,
} from "../lib/monitoring-proof";
import { sendSentryDiagnostic } from "../lib/monitoring-core";
import {
  safeOperationalDiagnostic,
  type OperationalDiagnostic,
} from "../lib/operational-diagnostics";

const secret = "production-maintenance-secret-value-123";
const accepted = {
  status: "accepted" as const,
  eventId: "a".repeat(32),
  httpStatus: 200,
};

function request(input: {
  authorization?: string;
  intent?: string;
  body?: BodyInit | null;
  headers?: HeadersInit;
}) {
  const headers = new Headers(input.headers);
  if (input.authorization) headers.set("authorization", input.authorization);
  if (input.intent)
    headers.set("x-pnlwise-monitoring-proof", input.intent);
  const init = {
    method: "POST",
    headers,
    body: input.body,
    ...(input.body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit;
  return new Request("https://pnlwise.test/api/monitoring/proof", init);
}

test("existing staging proof behavior remains unchanged", async () => {
  const calls: Array<{
    diagnostic: OperationalDiagnostic;
    error: unknown;
  }> = [];
  const outcome = await executeMonitoringProof({
    request: request({
      authorization: `Bearer ${secret}`,
      body: "staging previously ignored request bodies",
    }),
    environment: "staging",
    maintenanceSecret: secret,
    report: async (diagnostic, error) => {
      calls.push({ diagnostic, error });
      return accepted;
    },
  });

  assert.deepEqual(outcome, {
    status: 200,
    accepted: true,
    eventId: accepted.eventId,
    httpStatus: accepted.httpStatus,
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.diagnostic, {
    code: "PNLWISE_OBS_STAGING_PROOF",
    stage: "monitoring.staging_proof",
    subsystem: "monitoring",
    route: "api.monitoring.proof",
    retryable: false,
    alertable: true,
  });
  assert.match(String(calls[0]?.error), /staging monitoring proof/);
});

test("authorized bodyless production proof reports exactly once without an Error", async () => {
  const calls: unknown[][] = [];
  const outcome = await executeMonitoringProof({
    request: request({
      authorization: `Bearer ${secret}`,
      intent: PRODUCTION_PROOF_HEADER,
    }),
    environment: "production",
    maintenanceSecret: secret,
    report: async (...args) => {
      calls.push(args);
      return accepted;
    },
  });

  assert.deepEqual(outcome, {
    status: 200,
    accepted: true,
    eventId: accepted.eventId,
    httpStatus: accepted.httpStatus,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.length, 1);
  assert.deepEqual(calls[0]?.[0], {
    code: "PNLWISE_SENTRY_PRODUCTION_PROOF_V1",
    stage: "monitoring.production_proof",
    subsystem: "monitoring",
    route: "api.monitoring.proof",
    retryable: false,
    alertable: true,
    fingerprint: PRODUCTION_PROOF_FINGERPRINT,
  });
});

test("production proof accepts null and zero-byte streamed bodies", async () => {
  for (const candidate of [
    request({
      authorization: `Bearer ${secret}`,
      intent: PRODUCTION_PROOF_HEADER,
      body: null,
    }),
    request({
      authorization: `Bearer ${secret}`,
      intent: PRODUCTION_PROOF_HEADER,
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    }),
    request({
      authorization: `Bearer ${secret}`,
      intent: PRODUCTION_PROOF_HEADER,
      headers: { "Content-Length": "0" },
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
    }),
  ]) {
    let reports = 0;
    const outcome = await executeMonitoringProof({
      request: candidate,
      environment: "production",
      maintenanceSecret: secret,
      report: async () => {
        reports++;
        return accepted;
      },
    });

    assert.equal(outcome.status, 200);
    assert.equal(reports, 1);
  }
});

test("wrong environment, authentication, or intent never reports", async () => {
  let reports = 0;
  const report = async () => {
    reports++;
    return accepted;
  };
  for (const input of [
    {
      environment: "development",
      request: request({
        authorization: `Bearer ${secret}`,
        intent: PRODUCTION_PROOF_HEADER,
      }),
      status: 404,
    },
    {
      environment: undefined,
      request: request({
        authorization: `Bearer ${secret}`,
        intent: PRODUCTION_PROOF_HEADER,
      }),
      status: 404,
    },
    {
      environment: "production",
      request: request({ intent: PRODUCTION_PROOF_HEADER }),
      status: 401,
    },
    {
      environment: "production",
      request: request({
        authorization: "Bearer wrong-secret-value-that-is-long-enough",
        intent: PRODUCTION_PROOF_HEADER,
      }),
      status: 401,
    },
    {
      environment: "production",
      request: request({ authorization: `Bearer ${secret}` }),
      status: 404,
    },
    {
      environment: "production",
      request: request({
        authorization: `Bearer ${secret}`,
        intent: "wrong-proof",
      }),
      status: 404,
    },
  ]) {
    const outcome = await executeMonitoringProof({
      request: input.request,
      environment: input.environment,
      maintenanceSecret: secret,
      report,
    });
    assert.equal(outcome.status, input.status);
  }
  assert.equal(reports, 0);
});

test("production request bodies fail closed without reporting or exposing content", async () => {
  const privateMarker = "PRIVATE_REPORT_BODY_AND_SECRET";
  for (const candidate of [
    request({
      authorization: `Bearer ${secret}`,
      intent: PRODUCTION_PROOF_HEADER,
      body: privateMarker,
    }),
    request({
      authorization: `Bearer ${secret}`,
      intent: PRODUCTION_PROOF_HEADER,
      body: new Uint8Array([1]),
    }),
    request({
      authorization: `Bearer ${secret}`,
      intent: PRODUCTION_PROOF_HEADER,
      body: new Uint8Array(128 * 1024),
    }),
    request({
      authorization: `Bearer ${secret}`,
      intent: PRODUCTION_PROOF_HEADER,
      headers: { "Content-Length": "0" },
      body: new Uint8Array([1]),
    }),
  ]) {
    let reports = 0;
    const outcome = await executeMonitoringProof({
      request: candidate,
      environment: "production",
      maintenanceSecret: secret,
      report: async () => {
        reports++;
        return accepted;
      },
    });

    assert.deepEqual(outcome, {
      status: 400,
      error: "Request body is not allowed.",
    });
    assert.equal(reports, 0);
    assert.doesNotMatch(JSON.stringify(outcome), new RegExp(privateMarker));
    assert.doesNotMatch(JSON.stringify(outcome), new RegExp(secret));
  }
});

test("production body guard rejects early and cancels unread content", async () => {
  let pulled = 0;
  let canceled = false;
  const streamedBody = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulled++;
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        canceled = true;
      },
    },
    { highWaterMark: 0 },
  );
  let reports = 0;
  const outcome = await executeMonitoringProof({
    request: request({
      authorization: `Bearer ${secret}`,
      intent: PRODUCTION_PROOF_HEADER,
      body: streamedBody,
    }),
    environment: "production",
    maintenanceSecret: secret,
    report: async () => {
      reports++;
      return accepted;
    },
  });

  assert.equal(outcome.status, 400);
  assert.equal(pulled, 1);
  assert.equal(canceled, true);
  assert.equal(reports, 0);
});

test("positive Content-Length and failed streams reject without reporting", async () => {
  let positiveLengthPulled = false;
  const cases = [
    request({
      authorization: `Bearer ${secret}`,
      intent: PRODUCTION_PROOF_HEADER,
      headers: { "Content-Length": "1" },
      body: new ReadableStream(
        {
          pull(controller) {
            positiveLengthPulled = true;
            controller.enqueue(new Uint8Array([1]));
          },
        },
        { highWaterMark: 0 },
      ),
    }),
    request({
      authorization: `Bearer ${secret}`,
      intent: PRODUCTION_PROOF_HEADER,
      body: new ReadableStream({
        pull(controller) {
          controller.error(new Error("PRIVATE_STREAM_FAILURE"));
        },
      }),
    }),
  ];

  for (const candidate of cases) {
    let reports = 0;
    const outcome = await executeMonitoringProof({
      request: candidate,
      environment: "production",
      maintenanceSecret: secret,
      report: async () => {
        reports++;
        return accepted;
      },
    });
    assert.deepEqual(outcome, {
      status: 400,
      error: "Request body is not allowed.",
    });
    assert.equal(reports, 0);
    assert.doesNotMatch(JSON.stringify(outcome), /PRIVATE_STREAM_FAILURE/);
  }
  assert.equal(positiveLengthPulled, false);
});

test("production proof fingerprint reaches a privacy-safe Sentry envelope", async () => {
  let envelope = "";
  const privateBody = "PRIVATE_BODY_NOT_SENT";
  const privateHeader = "PRIVATE_HEADER_NOT_SENT";
  const outcome = await executeMonitoringProof({
    request: new Request("https://pnlwise.test/api/monitoring/proof", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "x-pnlwise-monitoring-proof": PRODUCTION_PROOF_HEADER,
        "x-private-test-header": privateHeader,
      },
    }),
    environment: "production",
    maintenanceSecret: secret,
    report: async (diagnostic) =>
      sendSentryDiagnostic(safeOperationalDiagnostic(diagnostic), {
        dsn: "https://public@example.test/42",
        environment: "production",
        eventId: () => "b".repeat(32),
        now: () => new Date("2026-09-24T00:00:00.000Z"),
        fetcher: async (_input, init) => {
          envelope = String(init?.body);
          return new Response(null, { status: 200 });
        },
      }),
  });

  assert.equal(outcome.status, 200);
  const event = JSON.parse(envelope.split("\n")[2]!);
  assert.deepEqual(event.fingerprint, [PRODUCTION_PROOF_FINGERPRINT]);
  assert.equal(event.environment, "production");
  assert.equal(event.tags.runtime, "cloudflare-sites");
  assert.equal(event.tags.error_code, "PNLWISE_SENTRY_PRODUCTION_PROOF_V1");
  for (const prohibited of [secret, privateBody, privateHeader, "authorization"])
    assert.equal(envelope.includes(prohibited), false);
});

test("existing diagnostics keep default Sentry grouping", async () => {
  let envelope = "";
  const diagnostic = safeOperationalDiagnostic({
    code: "REQUEST_FAILED",
    stage: "api.request",
    alertable: true,
  });
  await sendSentryDiagnostic(diagnostic, {
    dsn: "https://public@example.test/42",
    environment: "production",
    eventId: () => "c".repeat(32),
    fetcher: async (_input, init) => {
      envelope = String(init?.body);
      return new Response(null, { status: 200 });
    },
  });

  const event = JSON.parse(envelope.split("\n")[2]!);
  assert.equal("fingerprint" in event, false);
  assert.equal("fingerprint" in diagnostic, false);
  assert.equal(
    "fingerprint" in
      safeOperationalDiagnostic({
        code: "REQUEST_FAILED",
        stage: "api.request",
        alertable: true,
        fingerprint: "PRIVATE FINGERPRINT",
      }),
    false,
  );
});

test("Sentry rejection returns 502 after exactly one reporting attempt", async () => {
  let reports = 0;
  const outcome = await executeMonitoringProof({
    request: request({
      authorization: `Bearer ${secret}`,
      intent: PRODUCTION_PROOF_HEADER,
    }),
    environment: "production",
    maintenanceSecret: secret,
    report: async () => {
      reports++;
      return {
        status: "rejected",
        eventId: "d".repeat(32),
        httpStatus: 503,
      };
    },
  });

  assert.deepEqual(outcome, {
    status: 502,
    error: "Monitoring did not accept the proof event.",
  });
  assert.equal(reports, 1);
});

test("proof implementation has no application-state or provider dependency", () => {
  const proof = readFileSync(
    new URL("../lib/monitoring-proof.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    proof,
    /\bdb\s*\(|\btrack\s*\(|getReport|saveReport|session\s*\(|openai|paddle/i,
  );
});
