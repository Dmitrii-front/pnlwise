import { env } from "cloudflare:workers";
import type { OperationalDiagnostic } from "./operational-diagnostics";
import {
  createOperationalReporter,
  sendSentryDiagnostic,
} from "./monitoring-core";

function runtimeSetting(key: string) {
  return (
    (env as unknown as Record<string, string | undefined>)[key] ||
    process.env[key]
  );
}

const reporter = createOperationalReporter({
  send: (diagnostic) =>
    sendSentryDiagnostic(diagnostic, {
      dsn: runtimeSetting("SENTRY_DSN"),
      environment:
        runtimeSetting("SENTRY_ENVIRONMENT") ||
        (process.env.NODE_ENV === "production" ? "production" : "development"),
    }),
});

/** Emits structured diagnostics without exception messages, stacks, request bodies, or user data. */
export async function reportOperationalError(
  diagnostic: OperationalDiagnostic,
  error?: unknown,
) {
  return reporter.report(diagnostic, error);
}

export function operationalErrorWasReported(error: unknown) {
  return reporter.wasReported(error);
}
