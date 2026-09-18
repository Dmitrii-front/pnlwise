import type { SafeOperationalDiagnostic } from "./operational-diagnostics";
import {
  safeOperationalDiagnostic,
  type OperationalDiagnostic,
} from "./operational-diagnostics";

export type MonitoringResult =
  | { status: "accepted"; eventId: string; httpStatus: number }
  | { status: "rejected"; eventId: string; httpStatus: number }
  | { status: "disabled" | "invalid" | "failed" | "not_alertable" }
  | { status: "duplicate" };

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function safeEnvironment(value: string | undefined) {
  return value && /^[a-z0-9][a-z0-9_.-]{1,31}$/.test(value) ? value : "unknown";
}

export async function sendSentryDiagnostic(
  diagnostic: SafeOperationalDiagnostic,
  options: {
    dsn?: string;
    environment?: string;
    fetcher?: Fetcher;
    eventId?: () => string;
    now?: () => Date;
  },
): Promise<MonitoringResult> {
  if (!options.dsn) return { status: "disabled" };
  let url: URL;
  try {
    url = new URL(options.dsn);
  } catch {
    return { status: "invalid" };
  }
  try {
    const project = url.pathname.split("/").filter(Boolean).pop();
    if (
      url.protocol !== "https:" ||
      !url.username ||
      !project ||
      !/^\d+$/.test(project)
    )
      return { status: "invalid" };

    const eventId = (options.eventId ?? (() => crypto.randomUUID()))()
      .replaceAll("-", "")
      .toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(eventId)) return { status: "invalid" };
    const timestamp = (options.now ?? (() => new Date()))();
    const tags: Record<string, string> = {
      error_code: diagnostic.code,
      subsystem: diagnostic.subsystem,
      operational_stage: diagnostic.stage,
      alertable: String(diagnostic.alertable),
      runtime: "cloudflare-sites",
    };
    if (diagnostic.route) tags.route = diagnostic.route;
    if (diagnostic.provider) tags.provider = diagnostic.provider;
    if (diagnostic.http_status)
      tags.http_status = String(diagnostic.http_status);
    if (typeof diagnostic.retryable === "boolean")
      tags.retryable = String(diagnostic.retryable);

    const envelope = [
      { event_id: eventId, sent_at: timestamp.toISOString(), dsn: options.dsn },
      { type: "event" },
      {
        event_id: eventId,
        timestamp: timestamp.getTime() / 1000,
        level: "error",
        platform: "javascript",
        environment: safeEnvironment(options.environment),
        message: `${diagnostic.code} at ${diagnostic.stage}`,
        tags,
        extra: diagnostic.provider_request_id
          ? { provider_request_id: diagnostic.provider_request_id }
          : undefined,
        exception: {
          values: [
            {
              type: diagnostic.code,
              value: "Details redacted to protect financial data",
            },
          ],
        },
      },
    ]
      .map((value) => JSON.stringify(value))
      .join("\n");
    const response = await (options.fetcher ?? fetch)(
      `${url.origin}/api/${project}/envelope/?sentry_key=${encodeURIComponent(url.username)}&sentry_version=7`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-sentry-envelope" },
        body: envelope,
        signal: AbortSignal.timeout(3000),
      },
    );
    return response.ok
      ? { status: "accepted", eventId, httpStatus: response.status }
      : { status: "rejected", eventId, httpStatus: response.status };
  } catch {
    return { status: "failed" };
  }
}

export function createOperationalReporter(options: {
  send: (diagnostic: SafeOperationalDiagnostic) => Promise<MonitoringResult>;
  emit?: (line: string) => void;
}) {
  const reportedErrors = new WeakSet<object>();
  return {
    async report(
      diagnostic: OperationalDiagnostic,
      error?: unknown,
    ): Promise<MonitoringResult> {
      if (error && typeof error === "object" && reportedErrors.has(error))
        return { status: "duplicate" };
      if (error && typeof error === "object") reportedErrors.add(error);
      const safe = safeOperationalDiagnostic(diagnostic);
      (options.emit ?? console.error)(JSON.stringify(safe));
      if (!safe.alertable) return { status: "not_alertable" };
      try {
        return await options.send(safe);
      } catch {
        return { status: "failed" };
      }
    },
    wasReported(error: unknown) {
      return !!error && typeof error === "object" && reportedErrors.has(error);
    },
  };
}
