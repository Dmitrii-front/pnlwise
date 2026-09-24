import {
  EventName,
  type TransactionCompletedEvent,
} from "@paddle/paddle-node-sdk";
import { api, json, setting, AppError } from "@/lib/server";
import { fulfillPaddleTransaction, paddleWebhookVerifier } from "@/lib/paddle";
import {
  isPaddleNotificationSecret,
  unmarshalPaddleWebhook,
} from "@/lib/paddle-payment-core";
import {
  MAX_API_BODY_BYTES,
  readBoundedRequestText,
  RequestBodyTooLargeError,
} from "@/lib/abuse-protection";

export const POST = (req: Request) =>
  api(async () => {
    const secret = setting("PADDLE_NOTIFICATION_WEBHOOK_SECRET");
    if (!isPaddleNotificationSecret(secret))
      throw new AppError(
        "Paddle Sandbox webhook is not configured.",
        503,
        undefined,
        {
          code: "PADDLE_WEBHOOK_CONFIG_INVALID",
          stage: "paddle.webhook.configuration",
          alertable: true,
        },
      );
    let payload: string;
    try {
      payload = await readBoundedRequestText(req, MAX_API_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError)
        throw new AppError("Payload too large.", 413);
      throw error;
    }
    try {
      const event = await unmarshalPaddleWebhook(
        payload,
        req.headers.get("paddle-signature") || "",
        secret!,
        paddleWebhookVerifier(),
      );
      if (event.eventType === EventName.TransactionCompleted)
        await fulfillPaddleTransaction(event as TransactionCompletedEvent);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("Invalid Paddle webhook.", 400);
    }
    return json({ received: true });
  });
