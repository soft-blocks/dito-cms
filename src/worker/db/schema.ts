import { sqliteTable, text, integer, real, check, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

import { user } from "./auth-schema";

// Application schema. Better Auth tables live in ./auth-schema.ts (generated).
// The user's data model is metadata (collections + fields); entry content is JSON
// in `entries`. No dynamic DDL ever. Timestamps = INTEGER epoch ms.

/** Simple key/value store. v1 use: auto-generated auth_secret fallback + project name. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type SettingRow = typeof settings.$inferSelect;

/**
 * A content type the user defines. `collection` holds many entries; `singleton`
 * holds exactly one. `slug` and `type` are immutable after create (renaming breaks
 * consumers and would require JSON rewrites). `content_version` is bumped on
 * publish/unpublish/delete (Phase 3) for cheap list ETags.
 */
export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type", { enum: ["collection", "singleton"] }).notNull(),
    /** Field name used as the list title; nullable until the user picks one. */
    titleField: text("title_field"),
    contentVersion: integer("content_version").notNull().default(0),
    sortOrder: real("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("collections_slug_unq").on(t.slug),
    index("collections_sort_idx").on(t.sortOrder),
    check("collections_type_chk", sql`${t.type} in ('collection', 'singleton')`),
  ],
);

export type CollectionRow = typeof collections.$inferSelect;

/**
 * One field on a collection. `name` is the API key (camelCase, immutable after
 * create). `type` is one of the 7 field types and is immutable too (delete + re-add
 * to change). `options` is per-type JSON, validated server-side via field-types.ts.
 */
export const fields = sqliteTable(
  "fields",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    label: text("label").notNull(),
    type: text("type", {
      enum: ["text", "rich_text", "number", "boolean", "picture", "video", "link"],
    }).notNull(),
    /** Per-type options, JSON-encoded. `{}` when no options set. */
    options: text("options").notNull().default("{}"),
    sortOrder: real("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("fields_collection_name_unq").on(t.collectionId, t.name),
    index("fields_collection_sort_idx").on(t.collectionId, t.sortOrder),
    check(
      "fields_type_chk",
      sql`${t.type} in ('text', 'rich_text', 'number', 'boolean', 'picture', 'video', 'link')`,
    ),
  ],
);

export type FieldRow = typeof fields.$inferSelect;

/**
 * A content entry. `draft_data` / `published_data` are JSON blobs of field values
 * keyed by field name. Status is DERIVED, never stored:
 *   - published_data IS NULL                  → draft
 *   - draft_updated_at > published_at         → published, with pending changes
 *   - else                                    → published (clean)
 * `slug` is optional; when set it's unique within (collection, locale). `locale` is
 * reserved for future i18n (always '' in v1). `sort_order`: append = max+1024,
 * reorder rewrites to index×1024. `published_etag` is a content hash set at publish.
 */
export const entries = sqliteTable(
  "entries",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    slug: text("slug"),
    locale: text("locale").notNull().default(""),
    draftData: text("draft_data").notNull().default("{}"),
    publishedData: text("published_data"),
    publishedEtag: text("published_etag"),
    sortOrder: real("sort_order").notNull().default(0),
    draftUpdatedAt: integer("draft_updated_at").notNull(),
    publishedAt: integer("published_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("entries_collection_slug_unq")
      .on(t.collectionId, t.locale, t.slug)
      .where(sql`${t.slug} IS NOT NULL`),
    index("entries_collection_sort_idx").on(t.collectionId, t.sortOrder),
    index("entries_published_sort_idx")
      .on(t.collectionId, t.sortOrder)
      .where(sql`${t.publishedData} IS NOT NULL`),
  ],
);

export type EntryRow = typeof entries.$inferSelect;

/**
 * An uploaded asset stored in R2. The object lives at `r2_key` = `media/<id>/<filename>`
 * and is served publicly at `GET /media/:id/:filename` (the unguessable id makes the URL
 * effectively private; immutable cache because the key never changes for a given media).
 * `status` is `uploading` while a multipart video upload is in flight (`upload_id` holds the
 * R2 multipart id) and flips to `ready` on completion; direct image uploads land `ready`.
 * `width`/`height` (images + videos) and `duration` (videos) are captured client-side.
 */
export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    filename: text("filename").notNull(),
    r2Key: text("r2_key").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    /** Video duration in seconds (may be fractional). */
    duration: real("duration"),
    alt: text("alt"),
    status: text("status", { enum: ["uploading", "ready"] }).notNull().default("ready"),
    /** R2 multipart upload id while a video upload is in flight; null once ready. */
    uploadId: text("upload_id"),
    createdAt: integer("created_at").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("media_r2_key_unq").on(t.r2Key),
    index("media_created_idx").on(t.createdAt),
    index("media_kind_idx").on(t.kind),
    check("media_kind_chk", sql`${t.kind} in ('image', 'video')`),
    check("media_status_chk", sql`${t.status} in ('uploading', 'ready')`),
  ],
);

export type MediaRow = typeof media.$inferSelect;
