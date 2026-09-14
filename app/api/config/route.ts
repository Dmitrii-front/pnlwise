import { json, price, setting } from "@/lib/server";
export function GET() {
  return json({
    priceCents: price(),
    aiEnabled: !!(setting("OPENAI_API_KEY") && setting("OPENAI_MODEL")),
    checkoutEnabled: !!(
      setting("STRIPE_SECRET_KEY") &&
      setting("STRIPE_WEBHOOK_SECRET") &&
      setting("APP_ORIGIN")
    ),
  });
}
