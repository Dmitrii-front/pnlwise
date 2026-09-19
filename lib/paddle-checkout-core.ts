import { paddlePurchaseKey } from "./paddle-payment-core";

export interface PaddleCheckoutRecord {
  id: string;
  purchase_key: string;
  status: string;
  paddle_transaction_id: string | null;
}

export interface PaddleCheckoutStore {
  claim(input: {
    id: string;
    purchaseKey: string;
    reportId: string;
    amount: number;
    now: number;
    staleBefore: number;
  }): Promise<{ record: PaddleCheckoutRecord; claimed: boolean }>;
  attachTransaction(paymentId: string, transactionId: string): Promise<boolean>;
  claimReplacement(input: {
    purchaseKey: string;
    transactionId: string;
    now: number;
  }): Promise<boolean>;
  markCreationFailed(paymentId: string): Promise<void>;
  find(purchaseKey: string): Promise<PaddleCheckoutRecord | null>;
}

export type PaddleCheckoutResult =
  | { status: "ready"; transactionId: string }
  | { status: "paid" }
  | { status: "busy" };

export async function ensurePaddleCheckout(input: {
  reportId: string;
  amount: number;
  store: PaddleCheckoutStore;
  createTransaction: (
    reportId: string,
    paymentId: string,
  ) => Promise<{ id: string }>;
  getTransaction: (transactionId: string) => Promise<{ status: string }>;
  now?: () => number;
  pause?: () => Promise<void>;
  attempts?: number;
}): Promise<PaddleCheckoutResult> {
  const now = input.now ?? Date.now;
  const purchaseKey = paddlePurchaseKey(input.reportId);
  const claimed = await input.store.claim({
    id: purchaseKey,
    purchaseKey,
    reportId: input.reportId,
    amount: input.amount,
    now: now(),
    staleBefore: now() - 120_000,
  });
  let record = claimed.record;

  const createClaimedTransaction = async (paymentId: string) => {
    try {
      const transaction = await input.createTransaction(
        input.reportId,
        paymentId,
      );
      if (await input.store.attachTransaction(paymentId, transaction.id))
        return { status: "ready", transactionId: transaction.id } as const;
    } catch (error) {
      await input.store.markCreationFailed(paymentId);
      throw error;
    }
    return undefined;
  };

  const resolveStoredTransaction = async (current: PaddleCheckoutRecord) => {
    const transactionId = current.paddle_transaction_id;
    if (!transactionId) return undefined;
    const transaction = await input.getTransaction(transactionId);
    if (transaction.status === "draft" || transaction.status === "ready")
      return { status: "ready", transactionId } as const;
    if (transaction.status === "paid" || transaction.status === "completed")
      return { status: "paid" } as const;
    if (
      transaction.status === "canceled" ||
      transaction.status === "past_due"
    ) {
      const replacementClaimed = await input.store.claimReplacement({
        purchaseKey,
        transactionId,
        now: now(),
      });
      if (replacementClaimed) return createClaimedTransaction(current.id);
      return undefined;
    }
    return { status: "busy" } as const;
  };

  if (record.status === "paid") return { status: "paid" };
  if (record.paddle_transaction_id) {
    const resolved = await resolveStoredTransaction(record);
    if (resolved) return resolved;
  }

  if (claimed.claimed) {
    const created = await createClaimedTransaction(record.id);
    if (created) return created;
  }

  const pause =
    input.pause ?? (() => new Promise((resolve) => setTimeout(resolve, 100)));
  for (let attempt = 0; attempt < (input.attempts ?? 20); attempt++) {
    await pause();
    const current = await input.store.find(purchaseKey);
    if (!current) break;
    record = current;
    if (record.status === "paid") return { status: "paid" };
    if (record.paddle_transaction_id) {
      const resolved = await resolveStoredTransaction(record);
      if (resolved) return resolved;
    }
    if (record.status === "checkout_failed") break;
  }
  return { status: "busy" };
}
