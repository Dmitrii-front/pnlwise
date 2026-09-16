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
import {
  createPaddleCheckout,
  paddleSandboxConfigured,
} from "@/lib/paddle";
import { PADDLE_PRICE_AMOUNT } from "@/lib/paddle-payment-core";
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
      !paddleSandboxConfigured()
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
    if (amount !== PADDLE_PRICE_AMOUNT)
      throw new AppError("Checkout is not configured correctly.", 503);
    const paymentId = `${report.id}:${report.revision}:${amount}`;
    await db()
      .prepare(
        "INSERT INTO payments(id,report_id,amount,currency,status,created_at) VALUES(?,?,?,'usd','pending',?) ON CONFLICT(id) DO NOTHING",
      )
      .bind(paymentId, report.id, amount, Date.now())
      .run();
    const existing = await db()
      .prepare(
        "SELECT paddle_transaction_id FROM payments WHERE id=? AND status='pending'",
      )
      .bind(paymentId)
      .first<{ paddle_transaction_id: string | null }>();
    let transactionId = existing?.paddle_transaction_id;
    if (!transactionId) {
      const transaction = await createPaddleCheckout(
        report.id,
        paymentId,
        origin,
      );
      const claimed = await db()
        .prepare(
          "UPDATE payments SET paddle_transaction_id=? WHERE id=? AND status='pending' AND paddle_transaction_id IS NULL",
        )
        .bind(transaction.id, paymentId)
        .run();
      if (claimed.meta.changes) transactionId = transaction.id;
      else {
        transactionId = (
          await db()
            .prepare(
              "SELECT paddle_transaction_id FROM payments WHERE id=? AND status='pending'",
            )
            .bind(paymentId)
            .first<{ paddle_transaction_id: string | null }>()
        )?.paddle_transaction_id;
      }
    }
    if (!transactionId)
      throw new AppError(
        "Checkout could not be started. Refresh the report and try again.",
        409,
      );
    await track("checkout_started");
    return json({
      transactionId,
      successUrl: `${origin}/checkout/success?report=${encodeURIComponent(report.id)}`,
    });
  });
