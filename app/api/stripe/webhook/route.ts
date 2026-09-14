import { api, json, setting, AppError } from "@/lib/server";
import { verifyStripeSignature, fulfill } from "@/lib/payments";
export const POST = (req: Request) =>
  api(async () => {
    const secret = setting("STRIPE_WEBHOOK_SECRET");
    if (!secret) throw new AppError("Webhook not configured.", 503);
    if (Number(req.headers.get("content-length")) > 100000)
      throw new AppError("Payload too large.", 413);
    const payload = await req.text();
    if (
      payload.length > 100000 ||
      !(await verifyStripeSignature(
        payload,
        req.headers.get("stripe-signature") || "",
        secret,
      ))
    )
      throw new AppError("Invalid webhook signature.", 400);
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      throw new AppError("Invalid event.", 400);
    }
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    )
      await fulfill(event.data.object);
    return json({ received: true });
  });
