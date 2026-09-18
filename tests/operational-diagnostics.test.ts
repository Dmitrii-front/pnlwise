import assert from "node:assert/strict";
import test from "node:test";
import {
  emitOperationalDiagnostic,
  safeProviderRequestId,
  safeOperationalDiagnostic,
} from "../lib/operational-diagnostics";

test("structured diagnostics retain only stable safe operational fields", () => {
  const providerError = {
    requestId: "req_safe-123456",
    message: "card 4242424242424242 for merchant Jane Doe",
    payload: { description: "PRIVATE BANK TRANSACTION", apiKey: "secret" },
  };
  const lines: string[] = [];
  const line = emitOperationalDiagnostic(
    {
      code: "PADDLE_CHECKOUT_CREATE_FAILED",
      stage: "paddle.checkout.create",
      providerRequestId: safeProviderRequestId(providerError),
      alertable: true,
    },
    (value) => lines.push(value),
  );

  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(line), {
    event: "operational_error",
    code: "PADDLE_CHECKOUT_CREATE_FAILED",
    stage: "paddle.checkout.create",
    subsystem: "payments",
    route: "api.checkout",
    provider: "paddle",
    provider_request_id: "req_safe-123456",
    alertable: true,
  });
  for (const sensitive of [
    "4242424242424242",
    "Jane Doe",
    "PRIVATE BANK TRANSACTION",
    "secret",
  ])
    assert.equal(line.includes(sensitive), false);
});

test("unsafe diagnostic values and provider identifiers are rejected", () => {
  assert.equal(
    safeProviderRequestId({ requestId: "unsafe request id with spaces" }),
    undefined,
  );
  assert.deepEqual(
    safeOperationalDiagnostic({
      code: "bad code with data",
      stage: "bad stage with data",
      providerRequestId: "contains secret spaces",
    }),
    {
      event: "operational_error",
      code: "DIAGNOSTIC_INVALID",
      stage: "diagnostic.invalid",
      subsystem: "runtime",
      alertable: false,
    },
  );
});
