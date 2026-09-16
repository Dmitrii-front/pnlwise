ALTER TABLE `payments` ADD `paddle_transaction_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `paddle_event_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_paddle_transaction_id_unique` ON `payments` (`paddle_transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_paddle_event_id_unique` ON `payments` (`paddle_event_id`);