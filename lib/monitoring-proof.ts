import type { MonitoringResult } from "./monitoring-core";
import type { OperationalDiagnostic } from "./operational-diagnostics";
import { readBoundedRequestBody } from "./abuse-protection";
import { maintenanceAuthorized } from "./retention";

export const PRODUCTION_PROOF_HEADER = "production-proof-v1";
export const PRODUCTION_PROOF_FINGERPRINT =
  "pnlwise-production-proof-20260924-v1";

type ProofReporter = (
  diagnostic: OperationalDiagnostic,
  error?: unknown,
) => Promise<MonitoringResult>;

export type MonitoringProofOutcome =
  | {
      status: 200;
      accepted: true;
      eventId: string;
      httpStatus: number;
    }
  | { status: 400 | 401 | 404 | 502; error: string };

const stagingDiagnostic: OperationalDiagnostic = {
  code: "PNLWISE_OBS_STAGING_PROOF",
  stage: "monitoring.staging_proof",
  subsystem: "monitoring",
  route: "api.monitoring.proof",
  retryable: false,
  alertable: true,
};

const productionDiagnostic: OperationalDiagnostic = {
  code: "PNLWISE_SENTRY_PRODUCTION_PROOF_V1",
  stage: "monitoring.production_proof",
  subsystem: "monitoring",
  route: "api.monitoring.proof",
  retryable: false,
  alertable: true,
  fingerprint: PRODUCTION_PROOF_FINGERPRINT,
};

export async function executeMonitoringProof(input: {
  request: Request;
  environment: string | undefined;
  maintenanceSecret: string | undefined;
  report: ProofReporter;
}): Promise<MonitoringProofOutcome> {
  if (input.environment !== "staging" && input.environment !== "production")
    return { status: 404, error: "Not found." };

  if (
    !maintenanceAuthorized(
      input.request.headers.get("authorization"),
      input.maintenanceSecret,
    )
  )
    return { status: 401, error: "Not authorized." };

  let result: MonitoringResult;
  if (input.environment === "production") {
    if (
      input.request.headers.get("x-pnlwise-monitoring-proof") !==
      PRODUCTION_PROOF_HEADER
    )
      return { status: 404, error: "Not found." };
    try {
      await readBoundedRequestBody(input.request, 0);
    } catch {
      return { status: 400, error: "Request body is not allowed." };
    }
    result = await input.report(productionDiagnostic);
  } else {
    result = await input.report(
      stagingDiagnostic,
      new Error("Synthetic privacy-safe staging monitoring proof."),
    );
  }

  if (result.status !== "accepted")
    return {
      status: 502,
      error: "Monitoring did not accept the proof event.",
    };
  return {
    status: 200,
    accepted: true,
    eventId: result.eventId,
    httpStatus: result.httpStatus,
  };
}
