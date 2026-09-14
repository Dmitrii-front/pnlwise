import { api, json, setting, cleanupExpired, AppError } from "@/lib/server";
export const POST = (req: Request) =>
  api(async () => {
    const secret = setting("MAINTENANCE_SECRET");
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
      throw new AppError("Not authorized.", 401);
    await cleanupExpired();
    return json({ cleaned: true });
  });
