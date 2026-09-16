import { json, price, setting } from "@/lib/server";
import { stripeTestConfigured } from "@/lib/payments";
export function GET() {
  return json({
    priceCents: price(),
    aiEnabled: !!(setting("OPENAI_API_KEY") && setting("OPENAI_MODEL")),
    checkoutEnabled: stripeTestConfigured(),
  });
}
