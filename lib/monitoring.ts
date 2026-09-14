import { env } from "cloudflare:workers";
/** A minimal Sentry envelope with no descriptions, request bodies, user IDs, or stack values. */
export async function reportErrorType(errorType: string) {
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
        message: "Application request failed",
        exception: {
          values: [
            {
              type: errorType.slice(0, 60),
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
