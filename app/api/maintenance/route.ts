import { api, json, setting, cleanupExpired, AppError } from "@/lib/server";
import {
  invokeRetentionMaintenance,
  type RetentionDiagnostic,
} from "@/lib/retention";

function logDiagnostic(entry: RetentionDiagnostic) {
  console.info(entry.event, entry);
}

export const POST = (req: Request) =>
  api(async () => {
    const secret = setting("MAINTENANCE_SECRET");
    let invocation;
    try {
      invocation = await invokeRetentionMaintenance(
        req.headers.get("authorization"),
        secret,
        () => cleanupExpired(true),
        logDiagnostic,
      );
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
    if (invocation.status !== 200)
      throw new AppError(
        invocation.status === 503
          ? "Maintenance is not configured."
          : "Not authorized.",
        invocation.status,
      );
    return json({ cleaned: true, ...invocation.result });
  });
