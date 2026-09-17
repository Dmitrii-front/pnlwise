import {
  api,
  body,
  json,
  guardOrigin,
  getReport,
  price,
  setting,
  AppError,
  sessionRate,
  track,
} from "@/lib/server";
import { needsReview } from "@/lib/domain";
import {
  getOrCreatePaddleCheckout,
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
    if (!origin || !paddleSandboxConfigured())
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
    const checkout = await getOrCreatePaddleCheckout(report.id, amount, origin);
    if (checkout.status === "paid")
      return json({ url: `/report/${report.id}` });
    if (checkout.status !== "ready")
      throw new AppError(
        "Checkout is already being prepared. Please retry in a moment.",
        409,
      );
    await track("checkout_started");
    return json({
      transactionId: checkout.transactionId,
      successUrl: `${origin}/checkout/success?report=${encodeURIComponent(report.id)}`,
    });
  });
