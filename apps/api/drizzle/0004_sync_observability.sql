ALTER TABLE `sync_runs` ADD `relations_skipped_unknown_issue` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `relations_skipped_same_role` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_runs` ADD `overtime_on_redemption_ignored` integer DEFAULT 0 NOT NULL;