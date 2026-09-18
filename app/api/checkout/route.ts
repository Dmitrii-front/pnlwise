import {
  api,
  body,
  json,
  guardOrigin,
  getReport,
  operationalIdentity,
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
    if (!operationalIdentity().configured)
      throw new AppError(
        "Purchases are not enabled yet. Your free report preview is saved. Please check back later.",
        503,
        undefined,
        {
          code: "OPERATIONAL_IDENTITY_MISSING",
          stage: "paddle.checkout.configuration",
          alertable: true,
        },
      );
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
    let checkout;
    try {
      checkout = await getOrCreatePaddleCheckout(report.id, amount, origin);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "Checkout is temporarily unavailable. Your report is saved. Please try again.",
        503,
        undefined,
        {
          code: "D1_CHECKOUT_FAILED",
          stage: "paddle.checkout.storage",
          alertable: true,
        },
      );
    }
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
