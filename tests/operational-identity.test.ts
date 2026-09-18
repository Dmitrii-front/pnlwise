import assert from "node:assert/strict";
import test from "node:test";
import {
  isSupportEmail,
  readOperationalIdentity,
} from "../lib/operational-identity";

function identity(values: Record<string, string | undefined>) {
  return readOperationalIdentity((key) => values[key]);
}

test("operational identity requires explicit valid operator and support email", () => {
  assert.deepEqual(
    identity({
      LEGAL_OPERATOR_NAME: "Example Operator LLC",
      SUPPORT_EMAIL: "help@example.com",
    }),
    {
      operator: "Example Operator LLC",
      supportEmail: "help@example.com",
      configured: true,
    },
  );

  assert.deepEqual(identity({}), {
    operator: null,
    supportEmail: null,
    configured: false,
  });
});

test("invalid operational identity fails closed", () => {
  assert.equal(isSupportEmail("help@example"), false);
  assert.equal(isSupportEmail("help @example.com"), false);
  assert.equal(
    isSupportEmail("help@example.com\r\nBcc: victim@example.com"),
    false,
  );
  assert.equal(
    identity({
      LEGAL_OPERATOR_NAME: "Example Operator LLC",
      SUPPORT_EMAIL: "help@example",
    }).configured,
    false,
  );
  assert.equal(
    identity({
      LEGAL_OPERATOR_NAME: "Bad\nOperator",
      SUPPORT_EMAIL: "help@example.com",
    }).configured,
    false,
  );
});
