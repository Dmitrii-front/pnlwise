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

  async claimReplacement(input: {
    purchaseKey: string;
    transactionId: string;
    now: number;
  }) {
    if (
      !this.record ||
      this.record.purchase_key !== input.purchaseKey ||
      this.record.paddle_transaction_id !== input.transactionId ||
      this.record.status !== "pending"
    )
      return false;
    this.record.status = "creating";
    this.record.paddle_transaction_id = null;
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
    getTransaction: async () => ({ status: "ready" }),
  });
  const afterRevision = await ensurePaddleCheckout({
    reportId: "report-1",
    amount: PADDLE_PRICE_AMOUNT,
    store,
    createTransaction,
    getTransaction: async () => ({ status: "ready" }),
  });
  assert.deepEqual(first, { status: "ready", transactionId: "txn_stable" });
  assert.deepEqual(afterRevision, first);
  assert.equal(creates, 1);
});

test("provider draft transaction remains reusable without a replacement", async () => {
  const store = new MemoryCheckoutStore();
  store.record = {
    id: "payment-stable",
    purchase_key:
      "paddle:report-1:pro_01m2n0p1mp3cxd2rnamzvyych0:pri_01m2n0p21kzx2crfnp99fph3v4",
    status: "pending",
    paddle_transaction_id: "txn_draft",
  };
  let creates = 0;
  const result = await ensurePaddleCheckout({
    reportId: "report-1",
    amount: PADDLE_PRICE_AMOUNT,
    store,
    createTransaction: async () => {
      creates++;
      return { id: "txn_replacement" };
    },
    getTransaction: async () => ({ status: "draft" }),
  });
  assert.deepEqual(result, { status: "ready", transactionId: "txn_draft" });
  assert.equal(creates, 0);
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
    getTransaction: async () => ({ status: "ready" }),
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
    getTransaction: async () => ({ status: "completed" }),
  });
  assert.deepEqual(result, { status: "paid" });
  assert.equal(creates, 0);
});

for (const status of ["paid", "completed"]) {
  test(`provider ${status} transaction never creates a replacement charge`, async () => {
    const store = new MemoryCheckoutStore();
    store.record = {
      id: "payment-1",
      purchase_key:
        "paddle:report-1:pro_01m2n0p1mp3cxd2rnamzvyych0:pri_01m2n0p21kzx2crfnp99fph3v4",
      status: "pending",
      paddle_transaction_id: "txn_paid",
    };
    let creates = 0;
    const result = await ensurePaddleCheckout({
      reportId: "report-1",
      amount: PADDLE_PRICE_AMOUNT,
      store,
      createTransaction: async () => {
        creates++;
        return { id: "txn_replacement" };
      },
      getTransaction: async () => ({ status }),
    });
    assert.deepEqual(result, { status: "paid" });
    assert.equal(creates, 0);
    assert.equal(store.record.paddle_transaction_id, "txn_paid");
  });
}

for (const status of ["canceled", "past_due"]) {
  test(`provider ${status} transaction is atomically replaced on the stable purchase`, async () => {
    const store = new MemoryCheckoutStore();
    store.record = {
      id: "payment-stable",
      purchase_key:
        "paddle:report-1:pro_01m2n0p1mp3cxd2rnamzvyych0:pri_01m2n0p21kzx2crfnp99fph3v4",
      status: "pending",
      paddle_transaction_id: "txn_terminal",
    };
    const result = await ensurePaddleCheckout({
      reportId: "report-1",
      amount: PADDLE_PRICE_AMOUNT,
      store,
      createTransaction: async (_reportId, paymentId) => {
        assert.equal(paymentId, "payment-stable");
        return { id: "txn_replacement" };
      },
      getTransaction: async () => ({ status }),
    });
    assert.deepEqual(result, {
      status: "ready",
      transactionId: "txn_replacement",
    });
    assert.equal(store.record.id, "payment-stable");
    assert.equal(store.record.paddle_transaction_id, "txn_replacement");
  });
}

test("concurrent terminal replacement attempts converge on one new transaction", async () => {
  const store = new MemoryCheckoutStore();
  store.record = {
    id: "payment-stable",
    purchase_key:
      "paddle:report-1:pro_01m2n0p1mp3cxd2rnamzvyych0:pri_01m2n0p21kzx2crfnp99fph3v4",
    status: "pending",
    paddle_transaction_id: "txn_canceled",
  };
  let creates = 0;
  const options = {
    reportId: "report-1",
    amount: PADDLE_PRICE_AMOUNT,
    store,
    createTransaction: async () => {
      creates++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { id: "txn_replacement" };
    },
    getTransaction: async (transactionId: string) => ({
      status: transactionId === "txn_canceled" ? "canceled" : "ready",
    }),
    pause: () => new Promise<void>((resolve) => setTimeout(resolve, 1)),
  };
  const results = await Promise.all([
    ensurePaddleCheckout(options),
    ensurePaddleCheckout(options),
  ]);
  assert.deepEqual(results, [
    { status: "ready", transactionId: "txn_replacement" },
    { status: "ready", transactionId: "txn_replacement" },
  ]);
  assert.equal(creates, 1);
});

test("provider lookup failure leaves the stored transaction untouched", async () => {
  const store = new MemoryCheckoutStore();
  store.record = {
    id: "payment-stable",
    purchase_key:
      "paddle:report-1:pro_01m2n0p1mp3cxd2rnamzvyych0:pri_01m2n0p21kzx2crfnp99fph3v4",
    status: "pending",
    paddle_transaction_id: "txn_existing",
  };
  await assert.rejects(
    ensurePaddleCheckout({
      reportId: "report-1",
      amount: PADDLE_PRICE_AMOUNT,
      store,
      createTransaction: async () => ({ id: "txn_replacement" }),
      getTransaction: async () => {
        throw new Error("provider unavailable");
      },
    }),
    /provider unavailable/,
  );
  assert.equal(store.record.paddle_transaction_id, "txn_existing");
  assert.equal(store.record.status, "pending");
});

test("ambiguous provider state fails closed without replacing the transaction", async () => {
  const store = new MemoryCheckoutStore();
  store.record = {
    id: "payment-stable",
    purchase_key:
      "paddle:report-1:pro_01m2n0p1mp3cxd2rnamzvyych0:pri_01m2n0p21kzx2crfnp99fph3v4",
    status: "pending",
    paddle_transaction_id: "txn_billed",
  };
  const result = await ensurePaddleCheckout({
    reportId: "report-1",
    amount: PADDLE_PRICE_AMOUNT,
    store,
    createTransaction: async () => ({ id: "txn_replacement" }),
    getTransaction: async () => ({ status: "billed" }),
  });
  assert.deepEqual(result, { status: "busy" });
  assert.equal(store.record.paddle_transaction_id, "txn_billed");
});
