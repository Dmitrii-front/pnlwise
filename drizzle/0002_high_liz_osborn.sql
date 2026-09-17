ALTER TABLE `payments` ADD `purchase_key` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `failure_reason` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `checkout_claimed_at` integer;--> statement-breakpoint
UPDATE `payments` AS p
SET purchase_key = 'paddle:' || report_id || ':pro_01m2n0p1mp3cxd2rnamzvyych0:pri_01m2n0p21kzx2crfnp99fph3v4'
WHERE (paddle_transaction_id IS NOT NULL OR paddle_event_id IS NOT NULL)
  AND id = (
    SELECT candidate.id
    FROM `payments` AS candidate
    WHERE candidate.report_id = p.report_id
      AND (candidate.paddle_transaction_id IS NOT NULL OR candidate.paddle_event_id IS NOT NULL)
    ORDER BY
      CASE candidate.status WHEN 'paid' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
      candidate.created_at,
      candidate.id
    LIMIT 1
  );--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payments_purchase_key` ON `payments` (`purchase_key`);
