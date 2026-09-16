import { json, price, setting } from "@/lib/server";
import { paddleSandboxConfigured } from "@/lib/paddle";
export function GET() {
  return json({
    priceCents: price(),
    aiEnabled: !!(setting("OPENAI_API_KEY") && setting("OPENAI_MODEL")),
    checkoutEnabled: paddleSandboxConfigured(),
  });
}
