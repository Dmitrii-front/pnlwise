import { api, json, setting, AppError } from "@/lib/server";
import { reportOperationalError } from "@/lib/monitoring";
import { maintenanceAuthorized } from "@/lib/retention";

export const POST = (request: Request) =>
  api(
    async () => {
      if (setting("SENTRY_ENVIRONMENT") !== "staging")
        throw new AppError("Not found.", 404);
      if (
        !maintenanceAuthorized(
          request.headers.get("authorization"),
          setting("MAINTENANCE_SECRET"),
        )
      )
        throw new AppError("Not authorized.", 401);

      const result = await reportOperationalError(
        {
          code: "PNLWISE_OBS_STAGING_PROOF",
          stage: "monitoring.staging_proof",
          subsystem: "monitoring",
          route: "api.monitoring.proof",
          retryable: false,
          alertable: true,
        },
        new Error("Synthetic privacy-safe staging monitoring proof."),
      );
      if (result.status !== "accepted")
        throw new AppError("Monitoring did not accept the proof event.", 502);
      return json({
        accepted: true,
        eventId: result.eventId,
        httpStatus: result.httpStatus,
      });
    },
    {
      subsystem: "monitoring",
      route: "api.monitoring.proof",
      stage: "monitoring.staging_proof",
    },
  );
