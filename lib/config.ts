function bounded(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  integer = false,
) {
  const n = value === undefined ? fallback : Number(value);
  return Number.isFinite(n) &&
    n >= min &&
    n <= max &&
    (!integer || Number.isInteger(n))
    ? n
    : fallback;
}
/** Public product defaults. Override NEXT_PUBLIC_* at build time; never put secrets here. */
export const config = {
  name: process.env.NEXT_PUBLIC_SERVICE_NAME || "Clearledger",
  operator: process.env.NEXT_PUBLIC_OPERATOR_NAME || "Clearledger",
  supportEmail:
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.invalid",
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://clearledger-pnl.icy-gnome-8351.chatgpt.site",
  priceCents: bounded(
    process.env.NEXT_PUBLIC_REPORT_PRICE_CENTS,
    1299,
    50,
    100000,
    true,
  ),
  retentionDays: bounded(
    process.env.NEXT_PUBLIC_REPORT_RETENTION_DAYS,
    30,
    1,
    365,
    true,
  ),
  highConfidence: bounded(
    process.env.NEXT_PUBLIC_HIGH_CONFIDENCE,
    0.85,
    0.7,
    1,
  ),
  reviewConfidence: bounded(
    process.env.NEXT_PUBLIC_REVIEW_CONFIDENCE,
    0.7,
    0,
    0.7,
  ),
};
export const legalDisclaimer =
  "This tool generates estimated financial reports based on the information you provide. It is not a CPA, accounting firm, tax advisor, lender, or financial advisor. Review all transaction categories before relying on the report and consult a qualified professional when appropriate.";
