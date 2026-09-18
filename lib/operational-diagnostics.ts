export interface OperationalDiagnostic {
  code: string;
  stage: string;
  providerRequestId?: string | null;
  alertable?: boolean;
}

export interface SafeOperationalDiagnostic {
  event: "operational_error";
  code: string;
  stage: string;
  provider_request_id?: string;
  alertable: boolean;
}

const safeCode = /^[A-Z][A-Z0-9_]{2,63}$/;
const safeStage = /^[a-z][a-z0-9_.-]{2,79}$/;
const safeRequestId = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;

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
  const value: SafeOperationalDiagnostic = {
    event: "operational_error",
    code: safeCode.test(diagnostic.code)
      ? diagnostic.code
      : "DIAGNOSTIC_INVALID",
    stage: safeStage.test(diagnostic.stage)
      ? diagnostic.stage
      : "diagnostic.invalid",
    alertable: diagnostic.alertable === true,
  };
  if (
    diagnostic.providerRequestId &&
    safeRequestId.test(diagnostic.providerRequestId)
  )
    value.provider_request_id = diagnostic.providerRequestId;
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
