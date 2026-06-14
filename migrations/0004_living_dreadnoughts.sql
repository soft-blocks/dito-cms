CREATE TABLE `deploy_hook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`fired_at` integer NOT NULL,
	`event` text NOT NULL,
	`detail` text,
	`url` text NOT NULL,
	`ok` integer NOT NULL,
	`status` integer,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `deploy_hook_deliveries_fired_idx` ON `deploy_hook_deliveries` (`fired_at`);