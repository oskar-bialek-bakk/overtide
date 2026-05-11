CREATE TABLE `app_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `issue_relations` (
	`id` integer PRIMARY KEY NOT NULL,
	`issue_from_id` integer NOT NULL,
	`issue_to_id` integer NOT NULL,
	`relation_type` text NOT NULL,
	`created_locally` integer DEFAULT false NOT NULL,
	`mirrored_at` text NOT NULL,
	FOREIGN KEY (`issue_from_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issue_to_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_rel_from` ON `issue_relations` (`issue_from_id`);--> statement-breakpoint
CREATE INDEX `idx_rel_to` ON `issue_relations` (`issue_to_id`);--> statement-breakpoint
CREATE TABLE `issues` (
	`id` integer PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`tracker_id` integer NOT NULL,
	`tracker_name` text NOT NULL,
	`project_id` integer NOT NULL,
	`project_name` text NOT NULL,
	`subject` text NOT NULL,
	`status_name` text NOT NULL,
	`is_closed` integer DEFAULT false NOT NULL,
	`author_id` integer,
	`assigned_to_id` integer,
	`created_on` text NOT NULL,
	`updated_on` text NOT NULL,
	`start_date` text,
	`due_date` text,
	`url` text NOT NULL,
	`raw_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_issues_role` ON `issues` (`role`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`issues_upserted` integer DEFAULT 0 NOT NULL,
	`time_entries_upserted` integer DEFAULT 0 NOT NULL,
	`relations_upserted` integer DEFAULT 0 NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_sync_running` ON `sync_runs` (`status`) WHERE status = 'running';--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` integer PRIMARY KEY NOT NULL,
	`issue_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`hours` real NOT NULL,
	`activity_id` integer NOT NULL,
	`activity_name` text NOT NULL,
	`spent_on` text NOT NULL,
	`comments` text,
	`created_on` text NOT NULL,
	`updated_on` text NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_te_issue` ON `time_entries` (`issue_id`);--> statement-breakpoint
CREATE INDEX `idx_te_spent_on` ON `time_entries` (`spent_on`);--> statement-breakpoint
CREATE INDEX `idx_te_activity` ON `time_entries` (`activity_id`);