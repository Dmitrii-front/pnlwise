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

export const PADDLE_UNFULFILLABLE_STATUS = "captured_unfulfillable";
export const PADDLE_UNFULFILLABLE_REASON = "report_missing_or_expired";

export interface PaddleTransactionForFulfillment {
  id: string;
  status: string;
  currencyCode: string;
  subscriptionId: string | null;
  discountId: string | null;
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
      tax: string;
      total: string;
      credit: string;
      creditToBalance: string;
      balance: string;
      grandTotal: string;
      grandTotalTax: string;
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
  finalizeCapturedPayment(
    payment: PaddlePaymentRecord,
    transactionId: string,
    eventId: string,
  ): Promise<"fulfilled" | "duplicate" | "unfulfillable">;
}

export type PaddleFulfillmentResult =
  | { status: "fulfilled" }
  | { status: "duplicate" }
  | { status: "unfulfillable" }
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

export function isPaddleSandboxConfiguration(input: {
  apiKey: string | undefined;
  clientToken: string | undefined;
  environment: string | undefined;
  publicEnvironment: string | undefined;
  notificationSecret: string | undefined;
  identityConfigured: boolean;
  amount: number;
  origin: string | undefined;
}) {
  return (
    isPaddleSandboxApiKey(input.apiKey) &&
    isPaddleSandboxClientToken(input.clientToken) &&
    isPaddleSandboxEnvironment(input.environment) &&
    isPaddleSandboxEnvironment(input.publicEnvironment) &&
    isPaddleNotificationSecret(input.notificationSecret) &&
    input.identityConfigured &&
    input.amount === PADDLE_PRICE_AMOUNT &&
    !!input.origin
  );
}

export function isPaddleNotificationSecret(secret: string | undefined) {
  if (!secret?.startsWith("pdl_ntfset_")) return false;
  const value = secret.slice("pdl_ntfset_".length);
  return value.length >= 32 && !/\s|[\u0000-\u001f\u007f]/.test(value);
}

export function paddleTransactionInput(reportId: string, paymentId: string) {
  return {
    items: [{ priceId: PADDLE_PRICE_ID, quantity: 1 }],
    currencyCode: PADDLE_CURRENCY as "USD",
    customData: { reportId, paymentId },
  };
}

export function paddlePurchaseKey(reportId: string) {
  return `paddle:${reportId}:${PADDLE_PRODUCT_ID}:${PADDLE_PRICE_ID}`;
}

function nonNegativeInteger(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
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
  const subtotal = nonNegativeInteger(totals?.subtotal);
  const discount = nonNegativeInteger(totals?.discount);
  const tax = nonNegativeInteger(totals?.tax);
  const total = nonNegativeInteger(totals?.total);
  const credit = nonNegativeInteger(totals?.credit);
  const creditToBalance = nonNegativeInteger(totals?.creditToBalance);
  const balance = nonNegativeInteger(totals?.balance);
  const grandTotal = nonNegativeInteger(totals?.grandTotal);
  const grandTotalTax = nonNegativeInteger(totals?.grandTotalTax);
  const capturedAttempts = transaction.payments.filter(
    (attempt) => attempt.status === "captured" && attempt.errorCode === null,
  );
  const validTotals =
    subtotal === PADDLE_PRICE_AMOUNT &&
    discount === 0 &&
    tax !== null &&
    total === subtotal + tax &&
    credit === 0 &&
    creditToBalance === 0 &&
    balance === 0 &&
    grandTotal === total &&
    grandTotalTax === tax;
  const captured =
    capturedAttempts.length === 1 &&
    nonNegativeInteger(capturedAttempts[0]?.amount) === total;
  const matches =
    transaction.subscriptionId === null &&
    transaction.discountId === null &&
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
    validTotals &&
    captured &&
    payment.amount === PADDLE_PRICE_AMOUNT &&
    payment.currency === PADDLE_CURRENCY.toLowerCase() &&
    payment.report_id === reportId &&
    payment.id === paymentId;

  if (!matches) return { status: "error", error: "verification_mismatch" };
  if (payment.status === "paid") return { status: "duplicate" };
  if (payment.status === PADDLE_UNFULFILLABLE_STATUS)
    return { status: "unfulfillable" };
  return {
    status: await store.finalizeCapturedPayment(
      payment,
      transaction.id,
      eventId,
    ),
  };
}
