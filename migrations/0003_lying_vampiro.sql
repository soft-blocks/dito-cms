CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`r2_key` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`width` integer,
	`height` integer,
	`duration` real,
	`alt` text,
	`status` text DEFAULT 'ready' NOT NULL,
	`upload_id` text,
	`created_at` integer NOT NULL,
	`created_by` text,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "media_kind_chk" CHECK("media"."kind" in ('image', 'video')),
	CONSTRAINT "media_status_chk" CHECK("media"."status" in ('uploading', 'ready'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_r2_key_unq` ON `media` (`r2_key`);--> statement-breakpoint
CREATE INDEX `media_created_idx` ON `media` (`created_at`);--> statement-breakpoint
CREATE INDEX `media_kind_idx` ON `media` (`kind`);