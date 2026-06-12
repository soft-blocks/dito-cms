CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`title_field` text,
	`content_version` integer DEFAULT 0 NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "collections_type_chk" CHECK("collections"."type" in ('collection', 'singleton'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_slug_unq` ON `collections` (`slug`);--> statement-breakpoint
CREATE INDEX `collections_sort_idx` ON `collections` (`sort_order`);--> statement-breakpoint
CREATE TABLE `fields` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`name` text NOT NULL,
	`label` text NOT NULL,
	`type` text NOT NULL,
	`options` text DEFAULT '{}' NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "fields_type_chk" CHECK("fields"."type" in ('text', 'rich_text', 'number', 'boolean', 'picture', 'video', 'link'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fields_collection_name_unq` ON `fields` (`collection_id`,`name`);--> statement-breakpoint
CREATE INDEX `fields_collection_sort_idx` ON `fields` (`collection_id`,`sort_order`);