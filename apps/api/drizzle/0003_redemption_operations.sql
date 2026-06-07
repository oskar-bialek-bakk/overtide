CREATE TABLE `redemption_operations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`redemption_issue_id` integer NOT NULL,
	`status` text NOT NULL,
	`warning` text,
	`missing_time_entries` integer DEFAULT 0 NOT NULL,
	`missing_relations` integer DEFAULT 0 NOT NULL,
	`request_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`redemption_issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_redemption_operations_issue` ON `redemption_operations` (`redemption_issue_id`);--> statement-breakpoint
CREATE INDEX `idx_redemption_operations_status` ON `redemption_operations` (`status`);