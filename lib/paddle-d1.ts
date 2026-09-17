export const paddleFinalizeSql = {
  markPaid:
    "UPDATE payments SET status='paid',paddle_event_id=?,failure_reason=NULL WHERE id=? AND paddle_transaction_id=? AND status='pending' AND EXISTS (SELECT 1 FROM reports WHERE id=? AND expires_at>?)",
  markReportPaid:
    "UPDATE reports SET paid=1 WHERE id=? AND paid=0 AND EXISTS (SELECT 1 FROM payments WHERE id=? AND status='paid' AND paddle_event_id=?)",
  recordCompleted:
    "INSERT INTO events(id,name,metadata,created_at) SELECT ?,'payment_completed','{}',? WHERE EXISTS (SELECT 1 FROM payments WHERE id=? AND status='paid' AND paddle_event_id=?) ON CONFLICT(id) DO NOTHING",
  markUnfulfillable:
    "UPDATE payments SET status=?,paddle_event_id=?,failure_reason=? WHERE id=? AND paddle_transaction_id=? AND status='pending' AND NOT EXISTS (SELECT 1 FROM reports WHERE id=? AND expires_at>?)",
} as const;

export const paddleCheckoutSql = {
  insertClaim:
    "INSERT INTO payments(id,report_id,purchase_key,amount,currency,status,checkout_claimed_at,created_at) SELECT ?,?,?,?,'usd','creating',?,? WHERE EXISTS (SELECT 1 FROM reports WHERE id=? AND expires_at>?) ON CONFLICT(purchase_key) DO NOTHING",
  activeForOwner:
    "SELECT 1 FROM payments JOIN reports ON reports.id=payments.report_id WHERE (reports.session_hash=? OR reports.user_id=?) AND payments.purchase_key IS NOT NULL AND payments.status IN ('creating','pending') LIMIT 1",
  deleteOwnedWithoutActive:
    "DELETE FROM reports WHERE (session_hash=? OR user_id=?) AND NOT EXISTS (SELECT 1 FROM payments JOIN reports AS purchase_reports ON purchase_reports.id=payments.report_id WHERE (purchase_reports.session_hash=? OR purchase_reports.user_id=?) AND payments.purchase_key IS NOT NULL AND payments.status IN ('creating','pending'))",
} as const;
