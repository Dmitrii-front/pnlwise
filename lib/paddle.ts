import {
  Environment,
  EventName,
  LogLevel,
  Paddle,
  type TransactionCompletedEvent,
} from "@paddle/paddle-node-sdk";
import { AppError, db, operationalIdentity, price, setting } from "./server";
import {
  ensurePaddleCheckout,
  type PaddleCheckoutRecord,
  type PaddleCheckoutStore,
} from "./paddle-checkout-core";
import { paddleCheckoutSql, paddleFinalizeSql } from "./paddle-d1";
import { safeProviderRequestId } from "./operational-diagnostics";
import { reportOperationalError } from "./monitoring";
import {
  PADDLE_CURRENCY,
  PADDLE_PRICE_AMOUNT,
  PADDLE_UNFULFILLABLE_REASON,
  PADDLE_UNFULFILLABLE_STATUS,
  fulfillPaddlePayment,
  paddleConfiguration,
  paddlePurchaseKey,
  paddleTransactionInput,
  type PaddlePaymentStore,
} from "./paddle-payment-core";

function currentPaddleConfiguration() {
  const apiKey = setting("PADDLE_API_KEY");
  const configuration = paddleConfiguration({
    apiKey,
    clientToken: setting("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN"),
    environment: setting("PADDLE_ENVIRONMENT"),
    publicEnvironment: setting("NEXT_PUBLIC_PADDLE_ENV"),
    notificationSecret: setting("PADDLE_NOTIFICATION_WEBHOOK_SECRET"),
    identityConfigured: operationalIdentity().configured,
    amount: price(),
    origin: setting("APP_ORIGIN"),
  });
  if (!configuration)
    throw new AppError("Paddle checkout is not configured correctly.", 503);
  return { ...configuration, apiKey: apiKey! };
}

function currentPaddle() {
  const configuration = currentPaddleConfiguration();
  return new Paddle(configuration.apiKey, {
    environment:
      configuration.environment === "sandbox"
        ? Environment.sandbox
        : Environment.production,
    logLevel: LogLevel.error,
  });
}

export function paddleConfigured() {
  try {
    currentPaddleConfiguration();
    return true;
  } catch {
    return false;
  }
}

export async function createPaddleCheckout(
  reportId: string,
  paymentId: string,
  origin: string,
) {
  if (!paddleConfigured())
    throw new AppError(
      "Purchases are not enabled yet. Your free report preview is saved. Please check back later.",
      503,
    );
  let transaction;
  try {
    const configuration = currentPaddleConfiguration();
    transaction = await currentPaddle().transactions.create({
      ...paddleTransactionInput(configuration.catalog, reportId, paymentId),
      checkout: {
        url: `${origin}/checkout?report=${encodeURIComponent(reportId)}`,
      },
    });
  } catch (error) {
    throw new AppError(
      "Checkout is temporarily unavailable. Your report is saved. Please try again.",
      502,
      undefined,
      {
        code: "PADDLE_CHECKOUT_CREATE_FAILED",
        stage: "paddle.checkout.create",
        providerRequestId: safeProviderRequestId(error),
        alertable: true,
      },
    );
  }
  const { catalog } = currentPaddleConfiguration();
  const item = transaction.items[0];
  if (
    !transaction.id ||
    transaction.subscriptionId !== null ||
    transaction.discountId !== null ||
    transaction.currencyCode !== PADDLE_CURRENCY ||
    transaction.items.length !== 1 ||
    item?.quantity !== 1 ||
    item.price?.id !== catalog.priceId ||
    item.price.productId !== catalog.productId ||
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
      undefined,
      {
        code: "PADDLE_CHECKOUT_RESPONSE_INVALID",
        stage: "paddle.checkout.validate",
        alertable: true,
      },
    );
  return transaction;
}

export function paddleWebhookVerifier() {
  return currentPaddle().webhooks;
}

const paddleCheckoutStore: PaddleCheckoutStore = {
  async claim(input) {
    const inserted = await db()
      .prepare(paddleCheckoutSql.insertClaim)
      .bind(
        input.id,
        input.reportId,
        input.purchaseKey,
        input.amount,
        input.now,
        input.now,
        input.reportId,
        input.now,
      )
      .run();
    let claimed = (inserted.meta.changes || 0) > 0;
    if (!claimed) {
      const reclaimed = await db()
        .prepare(
          "UPDATE payments SET status='creating',checkout_claimed_at=?,failure_reason=NULL WHERE purchase_key=? AND paddle_transaction_id IS NULL AND (status='checkout_failed' OR ((status='creating' OR status='pending') AND COALESCE(checkout_claimed_at,0)<?))",
        )
        .bind(input.now, input.purchaseKey, input.staleBefore)
        .run();
      claimed = (reclaimed.meta.changes || 0) > 0;
    }
    const record = await this.find(input.purchaseKey);
    if (!record)
      throw new AppError(
        "Checkout could not be started. Refresh the report and try again.",
        409,
      );
    return { record, claimed };
  },
  async attachTransaction(paymentId, transactionId) {
    const result = await db()
      .prepare(
        "UPDATE payments SET paddle_transaction_id=?,status='pending',checkout_claimed_at=NULL WHERE id=? AND status='creating' AND paddle_transaction_id IS NULL",
      )
      .bind(transactionId, paymentId)
      .run();
    return (result.meta.changes || 0) > 0;
  },
  async claimReplacement(input) {
    const result = await db()
      .prepare(paddleCheckoutSql.claimReplacement)
      .bind(input.now, input.purchaseKey, input.transactionId)
      .run();
    return (result.meta.changes || 0) > 0;
  },
  async markCreationFailed(paymentId) {
    await db()
      .prepare(
        "UPDATE payments SET status='checkout_failed',checkout_claimed_at=NULL,failure_reason='transaction_creation_failed' WHERE id=? AND status='creating' AND paddle_transaction_id IS NULL",
      )
      .bind(paymentId)
      .run();
  },
  async find(purchaseKey) {
    return db()
      .prepare(
        "SELECT id,purchase_key,status,paddle_transaction_id FROM payments WHERE purchase_key=?",
      )
      .bind(purchaseKey)
      .first<PaddleCheckoutRecord>();
  },
};

async function getPaddleCheckoutState(transactionId: string) {
  try {
    const transaction = await currentPaddle().transactions.get(transactionId);
    return { status: transaction.status };
  } catch (error) {
    throw new AppError(
      "Checkout status is temporarily unavailable. Your report is saved. Please try again.",
      502,
      undefined,
      {
        code: "PADDLE_CHECKOUT_LOOKUP_FAILED",
        stage: "paddle.checkout.lookup",
        providerRequestId: safeProviderRequestId(error),
        retryable: true,
        alertable: true,
      },
    );
  }
}

export async function getOrCreatePaddleCheckout(
  reportId: string,
  amount: number,
  origin: string,
) {
  const { catalog } = currentPaddleConfiguration();
  return ensurePaddleCheckout({
    reportId,
    purchaseKey: paddlePurchaseKey(reportId, catalog),
    amount,
    store: paddleCheckoutStore,
    createTransaction: (targetReportId, paymentId) =>
      createPaddleCheckout(targetReportId, paymentId, origin),
    getTransaction: getPaddleCheckoutState,
  });
}

const d1PaddlePaymentStore: PaddlePaymentStore = {
  async findByPaddleTransaction(transactionId) {
    return db()
      .prepare("SELECT * FROM payments WHERE paddle_transaction_id=?")
      .bind(transactionId)
      .first();
  },
  async finalizeCapturedPayment(payment, transactionId, eventId) {
    const analyticsId = `payment_completed:${payment.id}`;
    const now = Date.now();
    const results = await db().batch([
      db()
        .prepare(paddleFinalizeSql.markPaid)
        .bind(eventId, payment.id, transactionId, payment.report_id, now),
      db()
        .prepare(paddleFinalizeSql.markReportPaid)
        .bind(payment.report_id, payment.id, eventId),
      db()
        .prepare(paddleFinalizeSql.recordCompleted)
        .bind(analyticsId, now, payment.id, eventId),
      db()
        .prepare(paddleFinalizeSql.markUnfulfillable)
        .bind(
          PADDLE_UNFULFILLABLE_STATUS,
          eventId,
          PADDLE_UNFULFILLABLE_REASON,
          payment.id,
          transactionId,
          payment.report_id,
          now,
        ),
    ]);
    if ((results[0]?.meta.changes || 0) > 0) return "fulfilled";
    if ((results[3]?.meta.changes || 0) > 0) return "unfulfillable";
    const current = await db()
      .prepare("SELECT status FROM payments WHERE id=?")
      .bind(payment.id)
      .first<{ status: string }>();
    return current?.status === PADDLE_UNFULFILLABLE_STATUS
      ? "unfulfillable"
      : "duplicate";
  },
};

export async function fulfillPaddleTransaction(
  event: TransactionCompletedEvent,
) {
  if (event.eventType !== EventName.TransactionCompleted)
    return { status: "ignored" as const };
  let result;
  try {
    result = await fulfillPaddlePayment(
      event.data,
      event.eventId,
      d1PaddlePaymentStore,
      currentPaddleConfiguration().catalog,
    );
  } catch {
    throw new AppError(
      "Paddle payment fulfillment is temporarily unavailable.",
      503,
      undefined,
      {
        code: "D1_FULFILLMENT_FAILED",
        stage: "paddle.fulfillment.storage",
        alertable: true,
      },
    );
  }
  if (result.status === "unfulfillable")
    await reportOperationalError({
      code: "PADDLE_FULFILLMENT_UNFULFILLABLE",
      stage: "paddle.fulfillment.report",
      alertable: true,
    });
  if (result.status !== "error") return result;
  if (result.error === "not_registered")
    throw new AppError(
      "Paddle transaction is not registered yet.",
      409,
      undefined,
      {
        code: "PADDLE_FULFILLMENT_NOT_REGISTERED",
        stage: "paddle.fulfillment.association",
        alertable: true,
      },
    );
  throw new AppError(
    "Paddle payment verification did not match.",
    400,
    undefined,
    {
      code: "PADDLE_FULFILLMENT_VALIDATION_FAILED",
      stage: "paddle.fulfillment.validation",
      alertable: true,
    },
  );
}
