import { EventName, type TransactionCompletedEvent } from "@paddle/paddle-node-sdk";
import { api, json, setting, AppError } from "@/lib/server";
import {
  fulfillPaddleTransaction,
  paddleWebhookVerifier,
} from "@/lib/paddle";
import {
  isPaddleNotificationSecret,
  unmarshalPaddleWebhook,
} from "@/lib/paddle-payment-core";

export const POST = (req: Request) =>
  api(async () => {
    const secret = setting("PADDLE_NOTIFICATION_WEBHOOK_SECRET");
    if (!isPaddleNotificationSecret(secret))
      throw new AppError("Paddle Sandbox webhook is not configured.", 503);
    if (Number(req.headers.get("content-length")) > 100000)
      throw new AppError("Payload too large.", 413);
    const payload = await req.text();
    if (payload.length > 100000)
      throw new AppError("Payload too large.", 413);
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
