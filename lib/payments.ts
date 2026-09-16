export { verifyStripeSignature } from "./stripe-signature";
import { AppError, setting, db } from "./server";
import {
  fulfillPayment,
  isStripeTestSecretKey,
  isStripeWebhookSecret,
  type PaymentStore,
  type StripeCheckoutSession,
} from "./payment-core";

export function stripeTestConfigured() {
  return (
    isStripeTestSecretKey(setting("STRIPE_SECRET_KEY")) &&
    isStripeWebhookSecret(setting("STRIPE_WEBHOOK_SECRET")) &&
    !!setting("APP_ORIGIN")
  );
}

export async function stripe(
  path: string,
  options?: { body: URLSearchParams; idempotencyKey: string },
) {
  const key = setting("STRIPE_SECRET_KEY");
  if (!key)
    throw new AppError(
      "Downloads are not available for purchase yet. Your free preview is saved.",
      503,
    );
  if (!isStripeTestSecretKey(key))
    throw new AppError(
      "Checkout is restricted to Stripe Test Mode.",
      503,
    );
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: options ? "POST" : "GET",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${key}`,
      ...(options
        ? {
            "Content-Type": "application/x-www-form-urlencoded",
            "Idempotency-Key": options.idempotencyKey,
          }
        : {}),
    },
    body: options?.body,
  });
  if (!res.ok)
    throw new AppError(
      "Checkout is temporarily unavailable. Your report is saved. Please try again.",
      502,
    );
  return res.json() as Promise<{ id: string; url: string; status: string }>;
}
const d1PaymentStore: PaymentStore = {
  async findByStripeSession(sessionId) {
    return db()
      .prepare("SELECT * FROM payments WHERE stripe_session_id=?")
      .bind(sessionId)
      .first();
  },
  async markPaidOnce(payment, paymentIntentId) {
    const eventId = `payment_completed:${payment.id}`;
    const results = await db().batch([
      db()
        .prepare(
          "UPDATE payments SET status='paid',stripe_payment_intent_id=? WHERE id=? AND status='pending'",
        )
        .bind(paymentIntentId, payment.id),
      db()
        .prepare(
          "UPDATE reports SET paid=1 WHERE id=? AND paid=0 AND EXISTS (SELECT 1 FROM payments WHERE id=? AND status='paid')",
        )
        .bind(payment.report_id, payment.id),
      db()
        .prepare(
          "INSERT INTO events(id,name,metadata,created_at) SELECT ?,'payment_completed','{}',? WHERE EXISTS (SELECT 1 FROM payments WHERE id=? AND status='paid') ON CONFLICT(id) DO NOTHING",
        )
        .bind(eventId, Date.now(), payment.id),
    ]);
    return (results[0]?.meta.changes || 0) > 0;
  },
};

export async function fulfill(session: StripeCheckoutSession) {
  const result = await fulfillPayment(session, d1PaymentStore);
  if (result.status !== "error") return result;
  if (result.error === "not_registered")
    throw new AppError("Payment session is not registered yet.", 409);
  throw new AppError("Payment verification did not match.", 400);
}
