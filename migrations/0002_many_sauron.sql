CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`slug` text,
	`locale` text DEFAULT '' NOT NULL,
	`draft_data` text DEFAULT '{}' NOT NULL,
	`published_data` text,
	`published_etag` text,
	`sort_order` real DEFAULT 0 NOT NULL,
	`draft_updated_at` integer NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_collection_slug_unq` ON `entries` (`collection_id`,`locale`,`slug`) WHERE "entries"."slug" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `entries_collection_sort_idx` ON `entries` (`collection_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `entries_published_sort_idx` ON `entries` (`collection_id`,`sort_order`) WHERE "entries"."published_data" IS NOT NULL;