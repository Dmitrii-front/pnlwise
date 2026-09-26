import assert from "node:assert/strict";
import test from "node:test";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { sampleReport } from "../lib/domain";
import { exportAccess } from "../lib/export-access";
import {
  MAX_API_BODY_BYTES,
  readBoundedRequestText,
} from "../lib/abuse-protection";
import {
  PADDLE_CURRENCY,
  PADDLE_CATALOG,
  PADDLE_PRICE_AMOUNT,
  PADDLE_UNFULFILLABLE_REASON,
  PADDLE_UNFULFILLABLE_STATUS,
  fulfillPaddlePayment as fulfillPaddlePaymentForCatalog,
  isPaddleApiKey,
  isPaddleClientToken,
  isPaddleNotificationSecret,
  paddleConfiguration,
  paddleEnvironment,
  paddleTransactionInput,
  paddlePurchaseKey,
  unmarshalPaddleWebhook,
  type PaddlePaymentRecord,
  type PaddlePaymentStore,
  type PaddleCatalog,
  type PaddleTransactionForFulfillment,
} from "../lib/paddle-payment-core";

const sandboxCatalog = PADDLE_CATALOG.sandbox;
const liveCatalog = PADDLE_CATALOG.production;
const PADDLE_PRODUCT_ID = sandboxCatalog.productId;
const PADDLE_PRICE_ID = sandboxCatalog.priceId;
const paymentId = paddlePurchaseKey("report-1", sandboxCatalog);
const notificationSecret =
  "pdl_ntfset_01m2n7d5jhp19ef6kx6tbsdm06_abcdEFGH/ijklMNOP+qrstUVWxyz";
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
    id: "txn_01m2paddlepnlwise000000000",
    status: "completed",
    currencyCode: PADDLE_CURRENCY,
    subscriptionId: null,
    discountId: null,
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
        tax: "0",
        total: String(PADDLE_PRICE_AMOUNT),
        credit: "0",
        creditToBalance: "0",
        balance: "0",
        grandTotal: String(PADDLE_PRICE_AMOUNT),
        grandTotalTax: "0",
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
  reportExists = true;
  reportExpiresAt = Date.now() + 60_000;
  reportPaid = false;
  transitionCount = 0;
  unfulfillableCount = 0;
  failureReason: string | null = null;
  paymentCompletedEvents = new Set<string>();

  async findByPaddleTransaction(transactionId: string) {
    await Promise.resolve();
    return transactionId === "txn_01m2paddlepnlwise000000000"
      ? { ...this.payment }
      : null;
  }

  async finalizeCapturedPayment(
    payment: PaddlePaymentRecord,
    transactionId: string,
    eventId: string,
  ) {
    await Promise.resolve();
    assert.equal(transactionId, "txn_01m2paddlepnlwise000000000");
    assert.match(eventId, /^evt_/);
    if (this.payment.status === "paid") return "duplicate" as const;
    if (this.payment.status === PADDLE_UNFULFILLABLE_STATUS)
      return "unfulfillable" as const;
    if (!this.reportExists || this.reportExpiresAt <= Date.now()) {
      this.payment.status = PADDLE_UNFULFILLABLE_STATUS;
      this.failureReason = PADDLE_UNFULFILLABLE_REASON;
      this.unfulfillableCount++;
      return "unfulfillable" as const;
    }
    this.payment.status = "paid";
    this.reportPaid = true;
    this.transitionCount++;
    this.paymentCompletedEvents.add(`payment_completed:${payment.id}`);
    return "fulfilled" as const;
  }
}

function fulfillPaddlePayment(
  transaction: PaddleTransactionForFulfillment,
  eventId: string,
  store: PaddlePaymentStore,
  catalog: PaddleCatalog = sandboxCatalog,
) {
  return fulfillPaddlePaymentForCatalog(transaction, eventId, store, catalog);
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

test("checkout input fixes the selected catalog item and metadata", () => {
  assert.deepEqual(
    paddleTransactionInput(sandboxCatalog, "report-1", paymentId),
    {
      items: [{ priceId: PADDLE_PRICE_ID, quantity: 1 }],
      currencyCode: "USD",
      customData: { reportId: "report-1", paymentId },
    },
  );
  assert.deepEqual(
    paddleTransactionInput(liveCatalog, "report-1", paymentId).items,
    [{ priceId: "pri_01m3ems5yqsxjerf0k2rdpnxwg", quantity: 1 }],
  );
});

test("purchase identity is stable across report revisions", () => {
  assert.equal(
    paddlePurchaseKey("report-1", sandboxCatalog),
    `paddle:report-1:${PADDLE_PRODUCT_ID}:${PADDLE_PRICE_ID}`,
  );
});

test("Paddle environments and credential formats fail closed", () => {
  assert.equal(paddleEnvironment(undefined), "sandbox");
  assert.equal(paddleEnvironment("sandbox"), "sandbox");
  assert.equal(paddleEnvironment("production"), "production");
  assert.equal(paddleEnvironment("live"), null);
  assert.equal(isPaddleApiKey("pdl_sdbx_apikey_example", "sandbox"), true);
  assert.equal(isPaddleApiKey("pdl_live_apikey_example", "sandbox"), false);
  assert.equal(isPaddleApiKey("pdl_live_apikey_example", "production"), true);
  assert.equal(isPaddleClientToken("test_example", "sandbox"), true);
  assert.equal(isPaddleClientToken("live_example", "sandbox"), false);
  assert.equal(isPaddleClientToken("live_example", "production"), true);
});

test("valid Sandbox and Live configurations select the matching catalogs", () => {
  const sandbox = {
    apiKey: "pdl_sdbx_apikey_example",
    clientToken: "test_example",
    environment: "sandbox",
    publicEnvironment: "sandbox",
    notificationSecret,
    identityConfigured: true,
    amount: PADDLE_PRICE_AMOUNT,
    origin: "https://example.com",
  };
  assert.deepEqual(paddleConfiguration(sandbox), {
    environment: "sandbox",
    catalog: sandboxCatalog,
  });
  assert.deepEqual(
    paddleConfiguration({
      ...sandbox,
      apiKey: "pdl_live_apikey_example",
      clientToken: "live_example",
      environment: "production",
      publicEnvironment: "production",
    }),
    { environment: "production", catalog: liveCatalog },
  );
});

test("mixed and incomplete Paddle configurations are rejected", () => {
  const configured = {
    apiKey: "pdl_sdbx_apikey_example",
    clientToken: "test_example",
    environment: "sandbox",
    publicEnvironment: "sandbox",
    notificationSecret,
    identityConfigured: true,
    amount: PADDLE_PRICE_AMOUNT,
    origin: "https://example.com",
  };
  for (const invalid of [
    { ...configured, apiKey: "pdl_live_apikey_example" },
    { ...configured, clientToken: "live_example" },
    { ...configured, publicEnvironment: "production" },
    { ...configured, apiKey: undefined },
    { ...configured, clientToken: undefined },
    { ...configured, notificationSecret: undefined },
    { ...configured, identityConfigured: false },
    { ...configured, origin: undefined },
  ])
    assert.equal(paddleConfiguration(invalid), null);
});

test("notification secret validation accepts opaque Paddle signing material", () => {
  assert.equal(isPaddleNotificationSecret(notificationSecret), true);
  assert.equal(isPaddleNotificationSecret(undefined), false);
  assert.equal(isPaddleNotificationSecret(""), false);
  assert.equal(isPaddleNotificationSecret("pdl_ntfset_"), false);
  assert.equal(isPaddleNotificationSecret("pdl_ntfset_too-short"), false);
  assert.equal(
    isPaddleNotificationSecret(
      "pdl_ntfset_01m2n7d5jhp19ef6kx6tbsdm06_invalid value",
    ),
    false,
  );
});

test("official Paddle verifier rejects invalid signatures", async () => {
  const paddle = new Paddle("pdl_sdbx_apikey_test", {
    environment: Environment.sandbox,
  });
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
      notificationSecret,
      paddle.webhooks,
    ),
  );
});

test("valid Paddle signature reaches business validation", async () => {
  const paddle = new Paddle("pdl_sdbx_apikey_test", {
    environment: Environment.sandbox,
  });
  const payload = JSON.stringify({
    event_id: "evt_signed_unregistered",
    event_type: "transaction.completed",
    occurred_at: new Date().toISOString(),
    notification_id: "ntf_signed_unregistered",
    data: {
      id: "txn_signed_unregistered",
      status: "completed",
      currency_code: PADDLE_CURRENCY,
      subscription_id: null,
      custom_data: null,
      items: [],
      details: null,
      payments: [],
    },
  });
  const rawPayload = await readBoundedRequestText(
    new Request("https://pnlwise.test/api/paddle/webhook", {
      method: "POST",
      body: payload,
    }),
    MAX_API_BODY_BYTES,
  );
  const valid = await unmarshalPaddleWebhook(
    rawPayload,
    await paddleSignature(
      payload,
      notificationSecret,
      Math.floor(Date.now() / 1000),
    ),
    notificationSecret,
    paddle.webhooks,
  );
  assert.equal(valid.eventId, "evt_signed_unregistered");
  assert.equal(valid.eventType, "transaction.completed");
  assert.deepEqual(
    await fulfillPaddlePayment(
      valid.data as unknown as PaddleTransactionForFulfillment,
      valid.eventId,
      new MemoryPaddlePaymentStore(),
    ),
    { status: "error", error: "not_registered" },
  );
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

test("captured payment after report deletion is durably unfulfillable", async () => {
  const store = new MemoryPaddlePaymentStore();
  store.reportExists = false;
  assert.deepEqual(
    await fulfillPaddlePayment(completedTransaction(), "evt_deleted", store),
    { status: "unfulfillable" },
  );
  assert.equal(store.payment.status, PADDLE_UNFULFILLABLE_STATUS);
  assert.equal(store.failureReason, PADDLE_UNFULFILLABLE_REASON);
  assert.equal(store.reportPaid, false);
  assert.equal(store.paymentCompletedEvents.size, 0);
});

test("captured payment after report expiration is durably unfulfillable", async () => {
  const store = new MemoryPaddlePaymentStore();
  store.reportExpiresAt = 0;
  assert.deepEqual(
    await fulfillPaddlePayment(completedTransaction(), "evt_expired", store),
    { status: "unfulfillable" },
  );
  assert.equal(store.payment.status, PADDLE_UNFULFILLABLE_STATUS);
  assert.equal(store.reportPaid, false);
  assert.equal(store.paymentCompletedEvents.size, 0);
});

test("duplicate webhook for an unfulfillable capture has no repeated side effects", async () => {
  const store = new MemoryPaddlePaymentStore();
  store.reportExists = false;
  assert.equal(
    (await fulfillPaddlePayment(completedTransaction(), "evt_missing", store))
      .status,
    "unfulfillable",
  );
  assert.equal(
    (await fulfillPaddlePayment(completedTransaction(), "evt_again", store))
      .status,
    "unfulfillable",
  );
  assert.equal(store.unfulfillableCount, 1);
  assert.equal(store.paymentCompletedEvents.size, 0);
});

test("valid Paddle tax increases the captured total without changing the base", async () => {
  const store = new MemoryPaddlePaymentStore();
  assert.equal(
    (
      await fulfillPaddlePayment(
        completedTransaction({
          details: {
            totals: {
              subtotal: "1299",
              discount: "0",
              tax: "104",
              total: "1403",
              credit: "0",
              creditToBalance: "0",
              balance: "0",
              grandTotal: "1403",
              grandTotalTax: "104",
              currencyCode: "USD",
            },
          },
          payments: [{ amount: "1403", status: "captured", errorCode: null }],
        }),
        "evt_tax",
        store,
      )
    ).status,
    "fulfilled",
  );
});

test("inconsistent tax, captured totals, discounts, and credits fail closed", async () => {
  const totals = completedTransaction().details!.totals!;
  const invalid: PaddleTransactionForFulfillment[] = [
    completedTransaction({
      details: { totals: { ...totals, tax: "104", total: "1399" } },
      payments: [{ amount: "1399", status: "captured", errorCode: null }],
    }),
    completedTransaction({
      payments: [{ amount: "1403", status: "captured", errorCode: null }],
    }),
    completedTransaction({
      details: { totals: { ...totals, discount: "100", total: "1199" } },
      payments: [{ amount: "1199", status: "captured", errorCode: null }],
    }),
    completedTransaction({
      details: {
        totals: {
          ...totals,
          credit: "100",
          grandTotal: "1199",
        },
      },
      payments: [{ amount: "1199", status: "captured", errorCode: null }],
    }),
  ];
  for (const transaction of invalid) {
    const store = new MemoryPaddlePaymentStore();
    assert.deepEqual(
      await fulfillPaddlePayment(transaction, "evt_invalid_totals", store),
      { status: "error", error: "verification_mismatch" },
    );
    assert.equal(store.reportPaid, false);
  }
});

test("an attached Paddle discount fails closed even when its amount is zero", async () => {
  const store = new MemoryPaddlePaymentStore();
  assert.deepEqual(
    await fulfillPaddlePayment(
      completedTransaction({ discountId: "dsc_unauthorized" }),
      "evt_discount",
      store,
    ),
    { status: "error", error: "verification_mismatch" },
  );
  assert.equal(store.reportPaid, false);
  assert.equal(store.paymentCompletedEvents.size, 0);
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
      items: [
        {
          ...base.items[0],
          price: { ...base.items[0].price!, id: "pri_wrong" },
        },
      ],
    }),
    completedTransaction({
      items: [
        {
          ...base.items[0],
          price: { ...base.items[0].price!, productId: "pro_wrong" },
        },
      ],
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
          tax: "0",
          total: "1300",
          credit: "0",
          creditToBalance: "0",
          balance: "0",
          grandTotal: "1300",
          grandTotalTax: "0",
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

test("fulfillment rejects a transaction from the other Paddle environment", async () => {
  const store = new MemoryPaddlePaymentStore();
  assert.deepEqual(
    await fulfillPaddlePayment(
      completedTransaction(),
      "evt_wrong_environment",
      store,
      liveCatalog,
    ),
    { status: "error", error: "verification_mismatch" },
  );
  assert.equal(store.reportPaid, false);
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
    (await fulfillPaddlePayment(completedTransaction(), "evt_same", store))
      .status,
    "fulfilled",
  );
  assert.equal(
    (await fulfillPaddlePayment(completedTransaction(), "evt_same", store))
      .status,
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
  assert.deepEqual(results.map((result) => result.status).sort(), [
    "duplicate",
    "fulfilled",
  ]);
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
