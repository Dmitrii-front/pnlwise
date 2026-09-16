import { verifyStripeSignature } from "./stripe-signature";

export interface StripeCheckoutSession {
  id: string;
  payment_status: string;
  amount_total: number | null;
  currency: string | null;
  payment_intent: string | null;
  metadata?: { reportId?: string; paymentId?: string } | null;
}

export interface PaymentRecord {
  id: string;
  report_id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface PaymentStore {
  findByStripeSession(sessionId: string): Promise<PaymentRecord | null>;
  markPaidOnce(
    payment: PaymentRecord,
    paymentIntentId: string | null,
  ): Promise<boolean>;
}

export type FulfillmentResult =
  | { status: "fulfilled" }
  | { status: "duplicate" }
  | { status: "ignored" }
  | { status: "error"; error: "not_registered" | "verification_mismatch" };

export function isStripeTestSecretKey(key: string | undefined) {
  return !!key && /^(?:sk|rk)_test_[A-Za-z0-9_]+$/.test(key);
}

export function isStripeWebhookSecret(secret: string | undefined) {
  return !!secret && /^whsec_[A-Za-z0-9_]+$/.test(secret);
}

export function buildCheckoutForm({
  reportId,
  paymentId,
  amount,
  origin,
  productName,
}: {
  reportId: string;
  paymentId: string;
  amount: number;
  origin: string;
  productName: string;
}) {
  return new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][product_data][name]": productName,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/checkout/success?report=${reportId}`,
    cancel_url: `${origin}/checkout/cancel?report=${reportId}`,
    "metadata[reportId]": reportId,
    "metadata[paymentId]": paymentId,
    client_reference_id: reportId,
  });
}

export async function parseTestStripeEvent(
  payload: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  if (!(await verifyStripeSignature(payload, signature, secret, now)))
    return { ok: false as const, error: "signature" as const };
  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return { ok: false as const, error: "payload" as const };
  }
  if (
    !event ||
    typeof event !== "object" ||
    !("livemode" in event) ||
    event.livemode !== false
  )
    return { ok: false as const, error: "live_mode" as const };
  return { ok: true as const, event };
}

export async function fulfillPayment(
  session: StripeCheckoutSession,
  store: PaymentStore,
): Promise<FulfillmentResult> {
  if (session.payment_status !== "paid") return { status: "ignored" };
  const payment = await store.findByStripeSession(session.id);
  if (!payment) return { status: "error", error: "not_registered" };
  if (
    payment.amount !== session.amount_total ||
    payment.currency !== session.currency ||
    payment.report_id !== session.metadata?.reportId ||
    payment.id !== session.metadata?.paymentId
  )
    return { status: "error", error: "verification_mismatch" };
  if (payment.status === "paid") return { status: "duplicate" };
  return (await store.markPaidOnce(payment, session.payment_intent))
    ? { status: "fulfilled" }
    : { status: "duplicate" };
}
