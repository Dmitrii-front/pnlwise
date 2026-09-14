export { verifyStripeSignature } from "./stripe-signature";
import { AppError, setting, db, track } from "./server";
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
export async function fulfill(session: {
  id: string;
  payment_status: string;
  amount_total: number;
  currency: string;
  payment_intent: string;
  metadata?: { reportId?: string; paymentId?: string };
}) {
  if (session.payment_status !== "paid") return;
  const p = await db()
    .prepare("SELECT * FROM payments WHERE stripe_session_id=?")
    .bind(session.id)
    .first<{
      id: string;
      report_id: string;
      amount: number;
      currency: string;
      status: string;
    }>();
  if (!p) throw new AppError("Payment session is not registered yet.", 409);
  if (
    p.amount !== session.amount_total ||
    p.currency !== session.currency ||
    p.report_id !== session.metadata?.reportId ||
    p.id !== session.metadata?.paymentId
  )
    throw new AppError("Payment verification did not match.", 400);
  if (p.status === "paid") return;
  await db().batch([
    db()
      .prepare(
        "UPDATE payments SET status='paid',stripe_payment_intent_id=? WHERE id=? AND status!='paid'",
      )
      .bind(session.payment_intent || null, p.id),
    db().prepare("UPDATE reports SET paid=1 WHERE id=?").bind(p.report_id),
  ]);
  await track("payment_completed");
}
