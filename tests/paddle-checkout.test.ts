import assert from "node:assert/strict";
import test from "node:test";
import {
  ensurePaddleCheckout,
  type PaddleCheckoutRecord,
  type PaddleCheckoutStore,
} from "../lib/paddle-checkout-core";
import { PADDLE_PRICE_AMOUNT } from "../lib/paddle-payment-core";

class MemoryCheckoutStore implements PaddleCheckoutStore {
  record: PaddleCheckoutRecord | null = null;

  async claim(input: Parameters<PaddleCheckoutStore["claim"]>[0]) {
    if (!this.record) {
      this.record = {
        id: input.id,
        purchase_key: input.purchaseKey,
        status: "creating",
        paddle_transaction_id: null,
      };
      return { record: { ...this.record }, claimed: true };
    }
    return { record: { ...this.record }, claimed: false };
  }

  async attachTransaction(paymentId: string, transactionId: string) {
    if (
      !this.record ||
      this.record.id !== paymentId ||
      this.record.status !== "creating"
    )
      return false;
    this.record.status = "pending";
    this.record.paddle_transaction_id = transactionId;
    return true;
  }

  async markCreationFailed(paymentId: string) {
    if (this.record?.id === paymentId) this.record.status = "checkout_failed";
  }

  async find(purchaseKey: string) {
    return this.record?.purchase_key === purchaseKey
      ? { ...this.record }
      : null;
  }
}

test("checkout after a report revision reuses the active transaction", async () => {
  const store = new MemoryCheckoutStore();
  let creates = 0;
  const createTransaction = async () => {
    creates++;
    return { id: "txn_stable" };
  };
  const first = await ensurePaddleCheckout({
    reportId: "report-1",
    amount: PADDLE_PRICE_AMOUNT,
    store,
    createTransaction,
  });
  const afterRevision = await ensurePaddleCheckout({
    reportId: "report-1",
    amount: PADDLE_PRICE_AMOUNT,
    store,
    createTransaction,
  });
  assert.deepEqual(first, { status: "ready", transactionId: "txn_stable" });
  assert.deepEqual(afterRevision, first);
  assert.equal(creates, 1);
});

test("concurrent checkout attempts converge on one transaction", async () => {
  const store = new MemoryCheckoutStore();
  let creates = 0;
  const createTransaction = async () => {
    creates++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { id: "txn_concurrent" };
  };
  const options = {
    reportId: "report-1",
    amount: PADDLE_PRICE_AMOUNT,
    store,
    createTransaction,
    pause: () => new Promise<void>((resolve) => setTimeout(resolve, 1)),
  };
  const results = await Promise.all([
    ensurePaddleCheckout(options),
    ensurePaddleCheckout(options),
  ]);
  assert.deepEqual(results, [
    { status: "ready", transactionId: "txn_concurrent" },
    { status: "ready", transactionId: "txn_concurrent" },
  ]);
  assert.equal(creates, 1);
});

test("an already-paid purchase never creates another transaction", async () => {
  const store = new MemoryCheckoutStore();
  await store.claim({
    id: "payment-paid",
    purchaseKey:
      "paddle:report-1:pro_01m2n0p1mp3cxd2rnamzvyych0:pri_01m2n0p21kzx2crfnp99fph3v4",
    reportId: "report-1",
    amount: PADDLE_PRICE_AMOUNT,
    now: Date.now(),
    staleBefore: 0,
  });
  store.record!.status = "paid";
  let creates = 0;
  const result = await ensurePaddleCheckout({
    reportId: "report-1",
    amount: PADDLE_PRICE_AMOUNT,
    store,
    createTransaction: async () => {
      creates++;
      return { id: "txn_should_not_exist" };
    },
  });
  assert.deepEqual(result, { status: "paid" });
  assert.equal(creates, 0);
});
