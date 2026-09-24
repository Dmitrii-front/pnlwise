import {
  api,
  body,
  json,
  guardOrigin,
  rateLimit,
  sha256,
  track,
  AppError,
  reserveNonAiBudget,
} from "@/lib/server";
const names = [
  "landing_view",
  "primary_cta_clicked",
  "review_started",
  "account_created",
  "client_error",
];
export const POST = (req: Request) =>
  api(async () => {
    guardOrigin(req);
    const data = await body(req);
    if (!names.includes(data.name)) throw new AppError("Invalid event.");
    await rateLimit(
      `events:${await sha256(req.headers.get("cf-connecting-ip") || "local")}`,
      200,
      60,
    );
    let admitted = false;
    try {
      admitted = !!(await reserveNonAiBudget("public_events"));
    } catch {
      return json({ ok: true });
    }
    if (!admitted) return json({ ok: true });
    await track(data.name, data.metadata || {});
    return json({ ok: true });
  });
