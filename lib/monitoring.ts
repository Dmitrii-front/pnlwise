import { env } from "cloudflare:workers";
import {
  emitOperationalDiagnostic,
  safeOperationalDiagnostic,
  type OperationalDiagnostic,
} from "./operational-diagnostics";

const reportedErrors = new WeakSet<object>();

/** Emits structured diagnostics without exception messages, stacks, request bodies, or user data. */
export async function reportOperationalError(
  diagnostic: OperationalDiagnostic,
  error?: unknown,
) {
  const safe = safeOperationalDiagnostic(diagnostic);
  emitOperationalDiagnostic(diagnostic);
  if (error && typeof error === "object") reportedErrors.add(error);
  const dsn =
    (env as unknown as Record<string, string | undefined>).SENTRY_DSN ||
    process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const url = new URL(dsn);
    if (url.protocol !== "https:" || !url.username) return;
    const project = url.pathname.split("/").filter(Boolean).pop();
    if (!project || !/^\d+$/.test(project)) return;
    const eventId = crypto.randomUUID().replaceAll("-", "");
    const envelope = [
      { event_id: eventId, sent_at: new Date().toISOString(), dsn },
      { type: "event" },
      {
        event_id: eventId,
        timestamp: Date.now() / 1000,
        level: "error",
        platform: "javascript",
        message: `${safe.code} at ${safe.stage}`,
        tags: {
          error_code: safe.code,
          operational_stage: safe.stage,
          alertable: String(safe.alertable),
        },
        extra: safe.provider_request_id
          ? { provider_request_id: safe.provider_request_id }
          : undefined,
        exception: {
          values: [
            {
              type: safe.code,
              value: "Details redacted to protect financial data",
            },
          ],
        },
      },
    ]
      .map((v) => JSON.stringify(v))
      .join("\n");
    await fetch(
      `${url.origin}/api/${project}/envelope/?sentry_key=${encodeURIComponent(url.username)}&sentry_version=7`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-sentry-envelope" },
        body: envelope,
        signal: AbortSignal.timeout(3000),
      },
    );
  } catch {
    /* Error reporting must not break report access. */
  }
}

export function operationalErrorWasReported(error: unknown) {
  return !!error && typeof error === "object" && reportedErrors.has(error);
}
