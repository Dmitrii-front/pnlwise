import assert from "node:assert/strict";
import test from "node:test";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { sampleReport } from "../lib/domain";
import { exportAccess } from "../lib/export-access";
import {
  PADDLE_CURRENCY,
  PADDLE_PRICE_AMOUNT,
  PADDLE_PRICE_ID,
  PADDLE_PRODUCT_ID,
  fulfillPaddlePayment,
  isPaddleNotificationSecret,
  isPaddleSandboxApiKey,
  isPaddleSandboxClientToken,
  isPaddleSandboxEnvironment,
  paddleTransactionInput,
  unmarshalPaddleWebhook,
  type PaddlePaymentRecord,
  type PaddlePaymentStore,
  type PaddleTransactionForFulfillment,
} from "../lib/paddle-payment-core";

const paymentId = "report-1:7:1299";
const basePayment: PaddlePaymentRecord = {
  id: paymentId,
  report_id: "report-1",
  amount: PADDLE_PRICE_AMOUNT,
  currency: PADDLE_CURRENCY.toLowerCase(),
  status: "pending",
};

function completedTransaction(
  overrides: Partial<PaddleTransactionForFulfillment> = {},
): PaddleTransactionForFulfillment {
  return {
    id: "txn_01m2paddleclearledger000000",
    status: "completed",
    currencyCode: PADDLE_CURRENCY,
    subscriptionId: null,
    customData: { reportId: "report-1", paymentId },
    items: [
      {
        quantity: 1,
        price: {
          id: PADDLE_PRICE_ID,
          productId: PADDLE_PRODUCT_ID,
          billingCycle: null,
          trialPeriod: null,
          unitPrice: {
            amount: String(PADDLE_PRICE_AMOUNT),
            currencyCode: PADDLE_CURRENCY,
          },
        },
      },
    ],
    details: {
      totals: {
        subtotal: String(PADDLE_PRICE_AMOUNT),
        discount: "0",
        total: String(PADDLE_PRICE_AMOUNT),
        currencyCode: PADDLE_CURRENCY,
      },
    },
    payments: [
      {
        amount: String(PADDLE_PRICE_AMOUNT),
        status: "captured",
        errorCode: null,
      },
    ],
    ...overrides,
  };
}

class MemoryPaddlePaymentStore implements PaddlePaymentStore {
  payment = { ...basePayment };
  reportPaid = false;
  transitionCount = 0;
  paymentCompletedEvents = new Set<string>();

  async findByPaddleTransaction(transactionId: string) {
    await Promise.resolve();
    return transactionId === "txn_01m2paddleclearledger000000"
      ? { ...this.payment }
      : null;
  }

  async markPaddlePaidOnce(
    payment: PaddlePaymentRecord,
    transactionId: string,
    eventId: string,
  ) {
    await Promise.resolve();
    assert.equal(transactionId, "txn_01m2paddleclearledger000000");
    assert.match(eventId, /^evt_/);
    if (this.payment.status !== "pending") return false;
    this.payment.status = "paid";
    this.reportPaid = true;
    this.transitionCount++;
    this.paymentCompletedEvents.add(`payment_completed:${payment.id}`);
    return true;
  }
}

function readyReport(paid = false) {
  const report = sampleReport();
  return {
    ...report,
    paid,
    status: "ready" as const,
    transactions: report.transactions.map((transaction) => ({
      ...transaction,
      confidence: 1,
      userConfirmed: true,
    })),
  };
}

async function paddleSignature(payload: string, secret: string, time: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Buffer.from(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${time}:${payload}`),
    ),
  ).toString("hex");
  return `ts=${time};h1=${signature}`;
}

test("checkout input fixes the Sandbox catalog item and metadata", () => {
  assert.deepEqual(paddleTransactionInput("report-1", paymentId), {
    items: [{ priceId: PADDLE_PRICE_ID, quantity: 1 }],
    currencyCode: "USD",
    customData: { reportId: "report-1", paymentId },
  });
});

test("Sandbox configuration rejects Live credentials", () => {
  assert.equal(isPaddleSandboxApiKey("pdl_sdbx_apikey_example"), true);
  assert.equal(isPaddleSandboxApiKey("pdl_live_apikey_example"), false);
  assert.equal(isPaddleSandboxClientToken("test_example"), true);
  assert.equal(isPaddleSandboxClientToken("live_example"), false);
  assert.equal(isPaddleNotificationSecret("pdl_ntfset_example"), true);
  assert.equal(isPaddleSandboxEnvironment(undefined), true);
  assert.equal(isPaddleSandboxEnvironment("sandbox"), true);
  assert.equal(isPaddleSandboxEnvironment("production"), false);
  assert.equal(isPaddleSandboxEnvironment("live"), false);
});

test("official Paddle verifier rejects invalid signatures", async () => {
  const paddle = new Paddle("pdl_sdbx_apikey_test", {
    environment: Environment.sandbox,
  });
  const secret = "pdl_ntfset_test_secret";
  const payload = JSON.stringify({
    event_id: "evt_test",
    event_type: "test.event",
    occurred_at: new Date().toISOString(),
    data: {},
  });
  await assert.rejects(
    unmarshalPaddleWebhook(
      payload,
      `ts=${Math.floor(Date.now() / 1000)};h1=${"0".repeat(64)}`,
      secret,
      paddle.webhooks,
    ),
  );
  const valid = await unmarshalPaddleWebhook(
    payload,
    await paddleSignature(payload, secret, Math.floor(Date.now() / 1000)),
    secret,
    paddle.webhooks,
  );
  assert.equal(valid.eventId, "evt_test");
});

test("valid completed Paddle payment unlocks exactly once", async () => {
  const store = new MemoryPaddlePaymentStore();
  assert.deepEqual(
    await fulfillPaddlePayment(completedTransaction(), "evt_valid", store),
    { status: "fulfilled" },
  );
  assert.equal(store.reportPaid, true);
  assert.equal(store.transitionCount, 1);
  assert.equal(store.paymentCompletedEvents.size, 1);
});

test("wrong report, price, product, quantity, amount, or currency never unlocks", async () => {
  const base = completedTransaction();
  const invalid: PaddleTransactionForFulfillment[] = [
    completedTransaction({
      customData: { reportId: "report-2", paymentId },
    }),
    completedTransaction({
      customData: { reportId: "report-1", paymentId: "payment-wrong" },
    }),
    completedTransaction({
      items: [{ ...base.items[0], price: { ...base.items[0].price!, id: "pri_wrong" } }],
    }),
    completedTransaction({
      items: [{ ...base.items[0], price: { ...base.items[0].price!, productId: "pro_wrong" } }],
    }),
    completedTransaction({ items: [{ ...base.items[0], quantity: 2 }] }),
    completedTransaction({
      items: [
        {
          ...base.items[0],
          price: {
            ...base.items[0].price!,
            unitPrice: { amount: "1300", currencyCode: PADDLE_CURRENCY },
          },
        },
      ],
    }),
    completedTransaction({ currencyCode: "EUR" }),
    completedTransaction({
      details: {
        totals: {
          subtotal: "1300",
          discount: "0",
          total: "1300",
          currencyCode: PADDLE_CURRENCY,
        },
      },
      payments: [{ amount: "1300", status: "captured", errorCode: null }],
    }),
  ];
  for (const transaction of invalid) {
    const store = new MemoryPaddlePaymentStore();
    assert.deepEqual(
      await fulfillPaddlePayment(transaction, "evt_invalid", store),
      { status: "error", error: "verification_mismatch" },
    );
    assert.equal(store.reportPaid, false);
    assert.equal(store.paymentCompletedEvents.size, 0);
  }
});

test("incomplete, failed, or canceled payments never unlock", async () => {
  for (const status of ["draft", "ready", "paid", "past_due", "canceled"]) {
    const store = new MemoryPaddlePaymentStore();
    assert.deepEqual(
      await fulfillPaddlePayment(
        completedTransaction({ status }),
        `evt_${status}`,
        store,
      ),
      { status: "ignored" },
    );
    assert.equal(store.reportPaid, false);
  }
  const failedStore = new MemoryPaddlePaymentStore();
  assert.deepEqual(
    await fulfillPaddlePayment(
      completedTransaction({
        payments: [{ amount: "1299", status: "error", errorCode: "declined" }],
      }),
      "evt_failed",
      failedStore,
    ),
    { status: "error", error: "verification_mismatch" },
  );
  assert.equal(failedStore.reportPaid, false);
});

test("sequential duplicate Paddle webhooks have no repeated side effects", async () => {
  const store = new MemoryPaddlePaymentStore();
  assert.equal(
    (await fulfillPaddlePayment(completedTransaction(), "evt_same", store)).status,
    "fulfilled",
  );
  assert.equal(
    (await fulfillPaddlePayment(completedTransaction(), "evt_same", store)).status,
    "duplicate",
  );
  assert.equal(store.transitionCount, 1);
  assert.equal(store.paymentCompletedEvents.size, 1);
});

test("concurrent duplicate Paddle webhooks atomically fulfill only once", async () => {
  const store = new MemoryPaddlePaymentStore();
  const results = await Promise.all([
    fulfillPaddlePayment(completedTransaction(), "evt_same", store),
    fulfillPaddlePayment(completedTransaction(), "evt_same", store),
  ]);
  assert.deepEqual(
    results.map((result) => result.status).sort(),
    ["duplicate", "fulfilled"],
  );
  assert.equal(store.transitionCount, 1);
  assert.equal(store.paymentCompletedEvents.size, 1);
});

test("browser success without a webhook leaves every export locked", () => {
  for (const format of ["pdf", "xlsx", "csv"])
    assert.equal(
      exportAccess(readyReport(false)).status,
      402,
      `${format} should remain locked`,
    );
});

test("verified Paddle payment unlocks PDF, XLSX, and CSV through the common guard", async () => {
  const store = new MemoryPaddlePaymentStore();
  await fulfillPaddlePayment(completedTransaction(), "evt_exports", store);
  for (const format of ["pdf", "xlsx", "csv"])
    assert.deepEqual(
      exportAccess(readyReport(store.reportPaid)),
      { allowed: true },
      `${format} should be available`,
    );
});
