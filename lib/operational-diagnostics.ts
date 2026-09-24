export interface OperationalDiagnostic {
  code: string;
  stage: string;
  subsystem?: string;
  route?: string;
  provider?: string;
  providerRequestId?: string | null;
  httpStatus?: number;
  retryable?: boolean;
  alertable?: boolean;
}

export interface SafeOperationalDiagnostic {
  event: "operational_error";
  code: string;
  stage: string;
  subsystem: string;
  route?: string;
  provider?: string;
  provider_request_id?: string;
  http_status?: number;
  retryable?: boolean;
  alertable: boolean;
}

const safeCode = /^[A-Z][A-Z0-9_]{2,63}$/;
const safeStage = /^[a-z][a-z0-9_.-]{2,79}$/;
const safeRequestId = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;
const safeTag = /^[a-z][a-z0-9_.-]{1,63}$/;

function diagnosticDefaults(stage: string) {
  if (stage.startsWith("openai."))
    return {
      subsystem: "ai",
      route: "api.reports.process",
      provider: "openai",
    };
  if (stage.startsWith("paddle.checkout."))
    return {
      subsystem: "payments",
      route: "api.checkout",
      provider: "paddle",
    };
  if (stage.startsWith("paddle."))
    return {
      subsystem: "payments",
      route: "api.paddle.webhook",
      provider: "paddle",
    };
  if (stage.startsWith("parser."))
    return { subsystem: "parsing", route: "api.statements.upload" };
  if (stage.startsWith("export."))
    return { subsystem: "exports", route: "api.reports.export" };
  if (stage.startsWith("report."))
    return { subsystem: "reports", route: "api.reports.process" };
  if (stage.startsWith("maintenance.") || stage.startsWith("retention."))
    return { subsystem: "retention", route: "api.maintenance" };
  if (stage.startsWith("d1.")) return { subsystem: "storage" };
  if (stage.startsWith("monitoring."))
    return { subsystem: "monitoring", route: "api.monitoring.proof" };
  return { subsystem: "runtime" };
}

export function safeProviderRequestId(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  const direct = [record.requestId, record.request_id].find(
    (value) => typeof value === "string",
  );
  if (typeof direct === "string" && safeRequestId.test(direct)) return direct;
  const response = record.response as { headers?: Headers } | undefined;
  const header = response?.headers?.get?.("x-request-id");
  return header && safeRequestId.test(header) ? header : undefined;
}

export function safeOperationalDiagnostic(
  diagnostic: OperationalDiagnostic,
): SafeOperationalDiagnostic {
  const stage = safeStage.test(diagnostic.stage)
    ? diagnostic.stage
    : "diagnostic.invalid";
  const defaults = diagnosticDefaults(stage);
  const value: SafeOperationalDiagnostic = {
    event: "operational_error",
    code: safeCode.test(diagnostic.code)
      ? diagnostic.code
      : "DIAGNOSTIC_INVALID",
    stage,
    subsystem:
      diagnostic.subsystem && safeTag.test(diagnostic.subsystem)
        ? diagnostic.subsystem
        : defaults.subsystem,
    alertable: diagnostic.alertable === true,
  };
  const route =
    diagnostic.route && safeTag.test(diagnostic.route)
      ? diagnostic.route
      : defaults.route;
  const provider =
    diagnostic.provider && safeTag.test(diagnostic.provider)
      ? diagnostic.provider
      : defaults.provider;
  if (route) value.route = route;
  if (provider) value.provider = provider;
  if (
    diagnostic.providerRequestId &&
    safeRequestId.test(diagnostic.providerRequestId)
  )
    value.provider_request_id = diagnostic.providerRequestId;
  if (
    Number.isInteger(diagnostic.httpStatus) &&
    diagnostic.httpStatus! >= 400 &&
    diagnostic.httpStatus! <= 599
  )
    value.http_status = diagnostic.httpStatus;
  if (typeof diagnostic.retryable === "boolean")
    value.retryable = diagnostic.retryable;
  return value;
}

export function emitOperationalDiagnostic(
  diagnostic: OperationalDiagnostic,
  emit: (line: string) => void = console.error,
) {
  const line = JSON.stringify(safeOperationalDiagnostic(diagnostic));
  emit(line);
  return line;
}
