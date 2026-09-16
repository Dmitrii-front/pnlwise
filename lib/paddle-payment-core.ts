import type { Paddle } from "@paddle/paddle-node-sdk";

export const PADDLE_PRODUCT_ID = "pro_01m2n0p1mp3cxd2rnamzvyych0";
export const PADDLE_PRICE_ID = "pri_01m2n0p21kzx2crfnp99fph3v4";
export const PADDLE_PRICE_AMOUNT = 1299;
export const PADDLE_CURRENCY = "USD";

export interface PaddlePaymentRecord {
  id: string;
  report_id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface PaddleTransactionForFulfillment {
  id: string;
  status: string;
  currencyCode: string;
  subscriptionId: string | null;
  customData: Record<string, unknown> | null;
  items: Array<{
    quantity: number;
    price: {
      id: string;
      productId: string;
      billingCycle: unknown | null;
      trialPeriod: unknown | null;
      unitPrice: { amount: string; currencyCode: string };
    } | null;
  }>;
  details: {
    totals: {
      subtotal: string;
      discount: string;
      total: string;
      currencyCode: string;
    } | null;
  } | null;
  payments: Array<{
    amount: string;
    status: string;
    errorCode: string | null;
  }>;
}

export interface PaddlePaymentStore {
  findByPaddleTransaction(
    transactionId: string,
  ): Promise<PaddlePaymentRecord | null>;
  markPaddlePaidOnce(
    payment: PaddlePaymentRecord,
    transactionId: string,
    eventId: string,
  ): Promise<boolean>;
}

export type PaddleFulfillmentResult =
  | { status: "fulfilled" }
  | { status: "duplicate" }
  | { status: "ignored" }
  | { status: "error"; error: "not_registered" | "verification_mismatch" };

export function isPaddleSandboxApiKey(key: string | undefined) {
  return !!key && /^pdl_sdbx_apikey_[A-Za-z0-9_-]+$/.test(key);
}

export function isPaddleSandboxClientToken(token: string | undefined) {
  return !!token && /^test_[A-Za-z0-9_-]+$/.test(token);
}

export function isPaddleSandboxEnvironment(environment: string | undefined) {
  return environment === undefined || environment === "sandbox";
}

export function isPaddleNotificationSecret(secret: string | undefined) {
  return !!secret && /^pdl_ntfset_[A-Za-z0-9_-]+$/.test(secret);
}

export function paddleTransactionInput(reportId: string, paymentId: string) {
  return {
    items: [{ priceId: PADDLE_PRICE_ID, quantity: 1 }],
    currencyCode: PADDLE_CURRENCY as "USD",
    customData: { reportId, paymentId },
  };
}

export async function unmarshalPaddleWebhook(
  payload: string,
  signature: string,
  secret: string,
  webhooks: Paddle["webhooks"],
) {
  if (!payload || !signature || !isPaddleNotificationSecret(secret))
    throw new Error("Paddle webhook is not configured correctly.");
  return webhooks.unmarshal(payload, secret, signature);
}

export async function fulfillPaddlePayment(
  transaction: PaddleTransactionForFulfillment,
  eventId: string,
  store: PaddlePaymentStore,
): Promise<PaddleFulfillmentResult> {
  if (transaction.status !== "completed") return { status: "ignored" };
  const payment = await store.findByPaddleTransaction(transaction.id);
  if (!payment) return { status: "error", error: "not_registered" };

  const item = transaction.items[0];
  const totals = transaction.details?.totals;
  const reportId = transaction.customData?.reportId;
  const paymentId = transaction.customData?.paymentId;
  const captured = transaction.payments.some(
    (attempt) =>
      attempt.status === "captured" &&
      attempt.errorCode === null &&
      attempt.amount === totals?.total,
  );
  const matches =
    transaction.subscriptionId === null &&
    transaction.items.length === 1 &&
    item?.quantity === 1 &&
    item.price?.id === PADDLE_PRICE_ID &&
    item.price.productId === PADDLE_PRODUCT_ID &&
    item.price.billingCycle === null &&
    item.price.trialPeriod === null &&
    item.price.unitPrice.amount === String(PADDLE_PRICE_AMOUNT) &&
    item.price.unitPrice.currencyCode === PADDLE_CURRENCY &&
    transaction.currencyCode === PADDLE_CURRENCY &&
    totals?.currencyCode === PADDLE_CURRENCY &&
    totals.subtotal === String(PADDLE_PRICE_AMOUNT) &&
    totals.discount === "0" &&
    captured &&
    payment.amount === PADDLE_PRICE_AMOUNT &&
    payment.currency === PADDLE_CURRENCY.toLowerCase() &&
    payment.report_id === reportId &&
    payment.id === paymentId;

  if (!matches) return { status: "error", error: "verification_mismatch" };
  if (payment.status === "paid") return { status: "duplicate" };
  return (await store.markPaddlePaidOnce(payment, transaction.id, eventId))
    ? { status: "fulfilled" }
    : { status: "duplicate" };
}
