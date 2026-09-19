const allowedAnalyticsMetadata = new Set([
  "landing",
  "fileType",
  "statementCount",
  "transactionCount",
  "businessType",
  "reviewCount",
  "format",
  "kind",
  "removed",
  "batches",
  "remaining",
  "code",
  "stage",
]);

export function safeAnalyticsMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(
        ([key, value]) =>
          allowedAnalyticsMetadata.has(key) &&
          ["string", "number", "boolean"].includes(typeof value),
      )
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.slice(0, 160) : value,
      ]),
  );
}
