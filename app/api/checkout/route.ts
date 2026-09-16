import { config } from "@/lib/config";
import {
  api,
  body,
  json,
  guardOrigin,
  getReport,
  db,
  price,
  setting,
  AppError,
  sessionRate,
  track,
} from "@/lib/server";
import { needsReview } from "@/lib/domain";
import { stripe, stripeTestConfigured } from "@/lib/payments";
import { buildCheckoutForm } from "@/lib/payment-core";
export const POST = (req: Request) =>
  api(async () => {
    guardOrigin(req);
    await sessionRate(req, "checkout", 15);
    const input = await body(req),
      report = await getReport(String(input.reportId || ""));
    if (report.paid) return json({ url: `/report/${report.id}` });
    if (
      report.status !== "ready" ||
      report.transactions.some(
        (t) =>
          t.date >= report.periodStart &&
          t.date <= report.periodEnd &&
          needsReview(t),
      )
    )
      throw new AppError(
        "Review your transactions and generate the P&L before checking out.",
      );
    const origin = setting("APP_ORIGIN");
    if (
      !origin ||
      !stripeTestConfigured()
    )
      throw new AppError(
        "Purchases are not enabled yet. Your free report preview is saved. Please check back later.",
        503,
      );
    if (
      !/^https:\/\/[^/]+$/.test(origin) &&
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
    )
      throw new AppError("Checkout is not configured correctly.", 503);
    const amount = price();
    const paymentId = `${report.id}:${report.revision}:${amount}`;
    await db()
      .prepare(
        "INSERT INTO payments(id,report_id,amount,currency,status,created_at) VALUES(?,?,?,'usd','pending',?) ON CONFLICT(id) DO NOTHING",
      )
      .bind(paymentId, report.id, amount, Date.now())
      .run();
    const form = buildCheckoutForm({
      reportId: report.id,
      paymentId,
      amount,
      origin,
      productName: `${config.name} Profit & Loss Report`,
    });
    const s = await stripe("checkout/sessions", {
      body: form,
      idempotencyKey: `clearledger:${paymentId}`,
    });
    if (s.status === "expired")
      throw new AppError(
        "This checkout expired. Return to Review, generate the report again, and retry.",
        409,
      );
    await db()
      .prepare("UPDATE payments SET stripe_session_id=? WHERE id=?")
      .bind(s.id, paymentId)
      .run();
    await track("checkout_started");
    return json({ url: s.url });
  });
