import { api, json, setting, AppError } from "@/lib/server";
import { fulfill } from "@/lib/payments";
import { parseTestStripeEvent } from "@/lib/payment-core";
import {
  MAX_API_BODY_BYTES,
  readBoundedRequestText,
  RequestBodyTooLargeError,
} from "@/lib/abuse-protection";
export const POST = (req: Request) =>
  api(async () => {
    const secret = setting("STRIPE_WEBHOOK_SECRET");
    if (!secret) throw new AppError("Webhook not configured.", 503);
    let payload: string;
    try {
      payload = await readBoundedRequestText(req, MAX_API_BODY_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError)
        throw new AppError("Payload too large.", 413);
      throw error;
    }
    const parsed = await parseTestStripeEvent(
      payload,
      req.headers.get("stripe-signature") || "",
      secret,
    );
    if (!parsed.ok)
      throw new AppError(
        parsed.error === "live_mode"
          ? "Live Stripe events are not accepted in Test Mode."
          : parsed.error === "payload"
            ? "Invalid event."
            : "Invalid webhook signature.",
        400,
      );
    const event = parsed.event as {
      type?: string;
      data?: { object?: Parameters<typeof fulfill>[0] };
    };
    if (
      event.type &&
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    ) {
      const session = event.data?.object;
      if (!session || typeof session !== "object")
        throw new AppError("Invalid event.", 400);
      await fulfill(session);
    }
    return json({ received: true });
  });
