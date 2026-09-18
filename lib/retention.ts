export const RETENTION_BATCH_SIZE = 100;
export const RETENTION_MAX_BATCHES = 10;

export const retentionSql = {
  deleteExpiredReports:
    "DELETE FROM reports WHERE id IN (SELECT reports.id FROM reports WHERE reports.expires_at<? AND NOT EXISTS (SELECT 1 FROM payments WHERE payments.report_id=reports.id AND payments.purchase_key IS NOT NULL AND payments.status IN ('creating','pending')) ORDER BY reports.expires_at LIMIT ?)",
  hasExpiredReports:
    "SELECT 1 FROM reports WHERE reports.expires_at<? AND NOT EXISTS (SELECT 1 FROM payments WHERE payments.report_id=reports.id AND payments.purchase_key IS NOT NULL AND payments.status IN ('creating','pending')) LIMIT 1",
  deleteExpiredRateLimits: "DELETE FROM rate_limits WHERE expires_at<?",
  deleteExpiredAnalytics:
    "DELETE FROM events WHERE created_at<? AND name<>'payment_completed'",
} as const;

export interface RetentionStore {
  deleteExpiredReports(now: number, limit: number): Promise<number>;
  hasExpiredReports(now: number): Promise<boolean>;
  cleanupAuxiliary(now: number): Promise<void>;
}

export interface RetentionResult {
  removed: number;
  batches: number;
  remaining: boolean;
}

export async function runRetentionCleanup(
  store: RetentionStore,
  now = Date.now(),
): Promise<RetentionResult> {
  let removed = 0;
  let batches = 0;
  for (; batches < RETENTION_MAX_BATCHES; batches++) {
    const count = await store.deleteExpiredReports(now, RETENTION_BATCH_SIZE);
    removed += count;
    if (count < RETENTION_BATCH_SIZE) {
      batches++;
      break;
    }
  }
  await store.cleanupAuxiliary(now);
  return {
    removed,
    batches,
    remaining: await store.hasExpiredReports(now),
  };
}

export function validMaintenanceSecret(secret: string | undefined) {
  return (
    !!secret && secret.length >= 32 && !/[\s\u0000-\u001f\u007f]/.test(secret)
  );
}

export function maintenanceAuthorized(
  authorization: string | null,
  secret: string | undefined,
) {
  return validMaintenanceSecret(secret) && authorization === `Bearer ${secret}`;
}
