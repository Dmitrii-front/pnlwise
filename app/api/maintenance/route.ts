import { api, json, setting, cleanupExpired, AppError } from "@/lib/server";
import { maintenanceAuthorized, validMaintenanceSecret } from "@/lib/retention";
export const POST = (req: Request) =>
  api(async () => {
    const secret = setting("MAINTENANCE_SECRET");
    if (!validMaintenanceSecret(secret))
      throw new AppError("Maintenance is not configured.", 503);
    if (!maintenanceAuthorized(req.headers.get("authorization"), secret))
      throw new AppError("Not authorized.", 401);
    let result;
    try {
      result = await cleanupExpired(true);
    } catch {
      throw new AppError(
        "Maintenance could not be completed.",
        500,
        undefined,
        {
          code: "RETENTION_MAINTENANCE_FAILED",
          stage: "maintenance.retention",
          alertable: true,
        },
      );
    }
    return json({ cleaned: true, ...result });
  });
