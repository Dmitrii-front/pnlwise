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

  if (record.status === "paid") return { status: "paid" };
  if (record.paddle_transaction_id)
    return { status: "ready", transactionId: record.paddle_transaction_id };

  if (claimed.claimed) {
    try {
      const transaction = await input.createTransaction(
        input.reportId,
        record.id,
      );
      if (await input.store.attachTransaction(record.id, transaction.id))
        return { status: "ready", transactionId: transaction.id };
    } catch (error) {
      await input.store.markCreationFailed(record.id);
      throw error;
    }
  }

  const pause =
    input.pause ?? (() => new Promise((resolve) => setTimeout(resolve, 100)));
  for (let attempt = 0; attempt < (input.attempts ?? 20); attempt++) {
    await pause();
    const current = await input.store.find(purchaseKey);
    if (!current) break;
    record = current;
    if (record.status === "paid") return { status: "paid" };
    if (record.paddle_transaction_id)
      return { status: "ready", transactionId: record.paddle_transaction_id };
    if (record.status === "checkout_failed") break;
  }
  return { status: "busy" };
}
