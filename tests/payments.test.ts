import assert from "node:assert/strict";
import test from "node:test";
import { sampleReport } from "../lib/domain";
import { exportAccess } from "../lib/export-access";
import {
  buildCheckoutForm,
  fulfillPayment,
  isStripeTestSecretKey,
  parseTestStripeEvent,
  type PaymentRecord,
  type PaymentStore,
  type StripeCheckoutSession,
} from "../lib/payment-core";

const paymentId = "report-1:7:1299";
const basePayment: PaymentRecord = {
  id: paymentId,
  report_id: "report-1",
  amount: 1299,
  currency: "usd",
  status: "pending",
};

const paidSession = (
  overrides: Partial<StripeCheckoutSession> = {},
): StripeCheckoutSession => ({
  id: "cs_test_clearledger",
  payment_status: "paid",
  amount_total: 1299,
  currency: "usd",
  payment_intent: "pi_test_clearledger",
  metadata: { reportId: "report-1", paymentId },
  ...overrides,
});

class MemoryPaymentStore implements PaymentStore {
  payment = { ...basePayment };
  reportPaid = false;
  transitionCount = 0;
  paymentCompletedEvents = new Set<string>();

  async findByStripeSession(sessionId: string) {
    await Promise.resolve();
    return sessionId === "cs_test_clearledger" ? { ...this.payment } : null;
  }

  async markPaidOnce(payment: PaymentRecord, paymentIntentId: string | null) {
    await Promise.resolve();
    if (this.payment.status !== "pending") return false;
    this.payment.status = "paid";
    this.reportPaid = true;
    this.transitionCount++;
    this.paymentCompletedEvents.add(`payment_completed:${payment.id}`);
    assert.equal(paymentIntentId, "pi_test_clearledger");
    return true;
  }
}

function readyReport(paid = false) {
  const report = sampleReport();
  return {
    ...report,
    paid,
    status: "ready",
    transactions: report.transactions.map((transaction) => ({
      ...transaction,
      confidence: 1,
      userConfirmed: true,
    })),
  };
}

async function stripeSignature(payload: string, secret: string, time: number) {
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
      new TextEncoder().encode(`${time}.${payload}`),
    ),
  ).toString("hex");
  return `t=${time},v1=${signature}`;
}

test("Checkout uses the server-controlled one-time $12.99 USD price", () => {
  const form = buildCheckoutForm({
    reportId: "report-1",
    paymentId,
    amount: 1299,
    origin: "https://clearledger.example",
    productName: "Clearledger Profit & Loss Report",
  });
  assert.equal(form.get("mode"), "payment");
  assert.equal(form.get("line_items[0][price_data][currency]"), "usd");
  assert.equal(form.get("line_items[0][price_data][unit_amount]"), "1299");
  assert.equal(form.get("line_items[0][quantity]"), "1");
  assert.equal(form.get("metadata[reportId]"), "report-1");
  assert.equal(form.get("metadata[paymentId]"), paymentId);
});

test("Test Mode accepts test credentials and rejects live credentials", () => {
  assert.equal(isStripeTestSecretKey("sk_test_example"), true);
  assert.equal(isStripeTestSecretKey("rk_test_example"), true);
  assert.equal(isStripeTestSecretKey("sk_live_example"), false);
  assert.equal(isStripeTestSecretKey("rk_live_example"), false);
  assert.equal(isStripeTestSecretKey(undefined), false);
});

test("webhook verification rejects invalid signatures and signed live events", async () => {
  const secret = "whsec_test_example";
  const time = Math.floor(Date.now() / 1000);
  const testPayload = JSON.stringify({
    livemode: false,
    type: "checkout.session.completed",
  });
  assert.deepEqual(
    await parseTestStripeEvent(
      testPayload,
      `t=${time},v1=${"0".repeat(64)}`,
      secret,
      time * 1000,
    ),
    { ok: false, error: "signature" },
  );
  const livePayload = JSON.stringify({
    livemode: true,
    type: "checkout.session.completed",
  });
  assert.deepEqual(
    await parseTestStripeEvent(
      livePayload,
      await stripeSignature(livePayload, secret, time),
      secret,
      time * 1000,
    ),
    { ok: false, error: "live_mode" },
  );
});

test("correct verified $12.99 payment unlocks the report once", async () => {
  const store = new MemoryPaymentStore();
  assert.deepEqual(await fulfillPayment(paidSession(), store), {
    status: "fulfilled",
  });
  assert.equal(store.payment.status, "paid");
  assert.equal(store.reportPaid, true);
  assert.equal(store.transitionCount, 1);
  assert.equal(store.paymentCompletedEvents.size, 1);
});

test("wrong amount, currency, or metadata never marks a payment paid", async () => {
  const invalid = [
    paidSession({ amount_total: 1300 }),
    paidSession({ currency: "eur" }),
    paidSession({ metadata: { reportId: "report-2", paymentId } }),
    paidSession({ metadata: { paymentId } }),
    paidSession({ metadata: { reportId: "report-1" } }),
    paidSession({ metadata: null }),
  ];
  for (const session of invalid) {
    const store = new MemoryPaymentStore();
    assert.deepEqual(await fulfillPayment(session, store), {
      status: "error",
      error: "verification_mismatch",
    });
    assert.equal(store.payment.status, "pending");
    assert.equal(store.reportPaid, false);
    assert.equal(store.paymentCompletedEvents.size, 0);
  }
});

test("sequential duplicate webhooks have no repeated side effects", async () => {
  const store = new MemoryPaymentStore();
  assert.equal((await fulfillPayment(paidSession(), store)).status, "fulfilled");
  assert.equal((await fulfillPayment(paidSession(), store)).status, "duplicate");
  assert.equal(store.transitionCount, 1);
  assert.equal(store.paymentCompletedEvents.size, 1);
});

test("concurrent duplicate webhooks atomically fulfill only once", async () => {
  const store = new MemoryPaymentStore();
  const results = await Promise.all([
    fulfillPayment(paidSession(), store),
    fulfillPayment(paidSession(), store),
  ]);
  assert.deepEqual(
    results.map((result) => result.status).sort(),
    ["duplicate", "fulfilled"],
  );
  assert.equal(store.transitionCount, 1);
  assert.equal(store.paymentCompletedEvents.size, 1);
  assert.equal(store.reportPaid, true);
});

test("cancelled or declined payment does not unlock downloads", async () => {
  for (const status of ["unpaid", "no_payment_required"]) {
    const store = new MemoryPaymentStore();
    assert.deepEqual(
      await fulfillPayment(paidSession({ payment_status: status }), store),
      { status: "ignored" },
    );
    assert.equal(store.reportPaid, false);
    assert.equal(exportAccess(readyReport(store.reportPaid)).status, 402);
  }
});

test("success redirect without a verified webhook keeps export at 402", () => {
  const access = exportAccess(readyReport(false));
  assert.equal(access.allowed, false);
  assert.equal(access.status, 402);
});

test("export is allowed only after verified payment", async () => {
  const store = new MemoryPaymentStore();
  assert.equal(exportAccess(readyReport(false)).status, 402);
  await fulfillPayment(paidSession(), store);
  assert.deepEqual(exportAccess(readyReport(store.reportPaid)), {
    allowed: true,
  });
});
