import {
  Environment,
  EventName,
  LogLevel,
  Paddle,
  type TransactionCompletedEvent,
} from "@paddle/paddle-node-sdk";
import { AppError, db, price, setting } from "./server";
import {
  PADDLE_CURRENCY,
  PADDLE_PRICE_AMOUNT,
  PADDLE_PRICE_ID,
  PADDLE_PRODUCT_ID,
  fulfillPaddlePayment,
  isPaddleNotificationSecret,
  isPaddleSandboxApiKey,
  isPaddleSandboxClientToken,
  isPaddleSandboxEnvironment,
  paddleTransactionInput,
  type PaddlePaymentStore,
} from "./paddle-payment-core";

function sandboxPaddle() {
  const apiKey = setting("PADDLE_API_KEY");
  if (!isPaddleSandboxApiKey(apiKey))
    throw new AppError(
      "Checkout is restricted to Paddle Sandbox credentials.",
      503,
    );
  return new Paddle(apiKey!, {
    environment: Environment.sandbox,
    logLevel: LogLevel.error,
  });
}

export function paddleSandboxConfigured() {
  return (
    isPaddleSandboxApiKey(setting("PADDLE_API_KEY")) &&
    isPaddleSandboxClientToken(setting("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN")) &&
    isPaddleSandboxEnvironment(setting("PADDLE_ENVIRONMENT")) &&
    isPaddleSandboxEnvironment(setting("NEXT_PUBLIC_PADDLE_ENV")) &&
    isPaddleNotificationSecret(
      setting("PADDLE_NOTIFICATION_WEBHOOK_SECRET"),
    ) &&
    price() === PADDLE_PRICE_AMOUNT &&
    !!setting("APP_ORIGIN")
  );
}

export async function createPaddleCheckout(
  reportId: string,
  paymentId: string,
  origin: string,
) {
  if (!paddleSandboxConfigured())
    throw new AppError(
      "Purchases are not enabled yet. Your free report preview is saved. Please check back later.",
      503,
    );
  const transaction = await sandboxPaddle().transactions.create({
    ...paddleTransactionInput(reportId, paymentId),
    checkout: {
      url: `${origin}/checkout?report=${encodeURIComponent(reportId)}`,
    },
  });
  const item = transaction.items[0];
  if (
    !transaction.id ||
    transaction.subscriptionId !== null ||
    transaction.currencyCode !== PADDLE_CURRENCY ||
    transaction.items.length !== 1 ||
    item?.quantity !== 1 ||
    item.price?.id !== PADDLE_PRICE_ID ||
    item.price.productId !== PADDLE_PRODUCT_ID ||
    item.price.billingCycle !== null ||
    item.price.trialPeriod !== null ||
    item.price.unitPrice.amount !== String(PADDLE_PRICE_AMOUNT) ||
    item.price.unitPrice.currencyCode !== PADDLE_CURRENCY ||
    transaction.customData?.reportId !== reportId ||
    transaction.customData?.paymentId !== paymentId
  )
    throw new AppError(
      "Checkout is temporarily unavailable. Your report is saved. Please try again.",
      502,
    );
  return transaction;
}

export function paddleWebhookVerifier() {
  return sandboxPaddle().webhooks;
}

const d1PaddlePaymentStore: PaddlePaymentStore = {
  async findByPaddleTransaction(transactionId) {
    return db()
      .prepare("SELECT * FROM payments WHERE paddle_transaction_id=?")
      .bind(transactionId)
      .first();
  },
  async markPaddlePaidOnce(payment, transactionId, eventId) {
    const analyticsId = `payment_completed:${payment.id}`;
    const results = await db().batch([
      db()
        .prepare(
          "UPDATE payments SET status='paid',paddle_event_id=? WHERE id=? AND paddle_transaction_id=? AND status='pending'",
        )
        .bind(eventId, payment.id, transactionId),
      db()
        .prepare(
          "UPDATE reports SET paid=1 WHERE id=? AND paid=0 AND EXISTS (SELECT 1 FROM payments WHERE id=? AND status='paid')",
        )
        .bind(payment.report_id, payment.id),
      db()
        .prepare(
          "INSERT INTO events(id,name,metadata,created_at) SELECT ?,'payment_completed','{}',? WHERE EXISTS (SELECT 1 FROM payments WHERE id=? AND status='paid') ON CONFLICT(id) DO NOTHING",
        )
        .bind(analyticsId, Date.now(), payment.id),
    ]);
    return (results[0]?.meta.changes || 0) > 0;
  },
};

export async function fulfillPaddleTransaction(
  event: TransactionCompletedEvent,
) {
  if (event.eventType !== EventName.TransactionCompleted)
    return { status: "ignored" as const };
  const result = await fulfillPaddlePayment(
    event.data,
    event.eventId,
    d1PaddlePaymentStore,
  );
  if (result.status !== "error") return result;
  if (result.error === "not_registered")
    throw new AppError("Paddle transaction is not registered yet.", 409);
  throw new AppError("Paddle payment verification did not match.", 400);
}
