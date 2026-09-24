import { api, json, setting, AppError } from "@/lib/server";
import { reportOperationalError } from "@/lib/monitoring";
import { executeMonitoringProof } from "@/lib/monitoring-proof";

export const POST = (request: Request) =>
  api(
    async () => {
      const outcome = await executeMonitoringProof({
        request,
        environment: setting("SENTRY_ENVIRONMENT"),
        maintenanceSecret: setting("MAINTENANCE_SECRET"),
        report: reportOperationalError,
      });
      if (outcome.status !== 200)
        throw new AppError(outcome.error, outcome.status);
      return json({
        accepted: outcome.accepted,
        eventId: outcome.eventId,
        httpStatus: outcome.httpStatus,
      });
    },
    {
      subsystem: "monitoring",
      route: "api.monitoring.proof",
      stage: "monitoring.staging_proof",
    },
  );
