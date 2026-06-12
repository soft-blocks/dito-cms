import { and, asc, count, desc, eq, inArray, like, or, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { DrizzleDb } from "../db/client";
import { collections, entries, media, type MediaRow } from "../db/schema";
import { badRequest, conflict, notFound, unsupportedMediaType, validationError } from "../lib/errors";

import {
  D1_IN_CHUNK,
  IMAGE_MIME_ALLOWLIST,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  PART_SIZE,
  VIDEO_MIME_ALLOWLIST,
} from "@/shared/constants";
import type { FieldDefinition } from "@/shared/validation";
import type {
  DeliveryMedia,
  EntryData,
  ListMediaParams,
  MediaDTO,
  MediaKind,
  MediaListResult,
  MediaUsage,
  UploadedPart,
} from "@/shared/api-types";

// Single owner of the R2 media pipeline: streamed image uploads, multipart video uploads,
// listing, usage scans, deletion, and the existence/kind checks that entry writes rely on.
// The R2 object key is `media/<id>/<filename>`; it never changes for a given media id, which
// is what lets the public serving route cache immutably and skip a D1 read.

const IMAGE_MIMES: readonly string[] = IMAGE_MIME_ALLOWLIST;
const VIDEO_MIMES: readonly string[] = VIDEO_MIME_ALLOWLIST;

/** Strip any path, keep only filesystem/URL-safe chars, cap length, never empty. */
export function sanitizeFilename(raw: string): string {
  const base = (raw.split(/[/\\]/).pop() ?? raw).trim();
  let name = base
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/-{2,}/g, "-");
  if (!name) name = "file";
  if (name.length > 100) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot) : "";
    name = name.slice(0, 100 - ext.length) + ext;
  }
  return name;
}

function mediaKey(id: string, filename: string): string {
  return `media/${id}/${filename}`;
}

/** Same-origin serving path for the admin UI (the SPA shares the worker's origin). */
function relativeUrl(row: MediaRow): string {
  return `/${row.r2Key}`;
}

export function toMediaDTO(row: MediaRow): MediaDTO {
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    url: relativeUrl(row),
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    duration: row.duration,
    alt: row.alt,
    createdAt: row.createdAt,
  };
}

/** Absolute URL for delivery (works on any domain — derived from the request origin). */
export function toDeliveryMedia(origin: string, row: MediaRow): DeliveryMedia {
  return {
    id: row.id,
    kind: row.kind,
    url: `${origin}/${row.r2Key}`,
    mime: row.mime,
    width: row.width,
    height: row.height,
    duration: row.duration,
    alt: row.alt,
    size: row.size,
  };
}

// --- batched lookup ----------------------------------------------------------

/** Fetch media rows by id, chunking the IN() under D1's 100-param ceiling. */
export async function fetchMediaByIds(db: DrizzleDb, ids: string[]): Promise<Map<string, MediaRow>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, MediaRow>();
  for (let i = 0; i < unique.length; i += D1_IN_CHUNK) {
    const chunk = unique.slice(i, i + D1_IN_CHUNK);
    const rows = await db.select().from(media).where(inArray(media.id, chunk)).all();
    for (const row of rows) out.set(row.id, row);
  }
  return out;
}

// --- listing -----------------------------------------------------------------

export async function listMedia(db: DrizzleDb, params: ListMediaParams): Promise<MediaListResult> {
  const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const conds: SQL[] = [eq(media.status, "ready")];
  if (params.kind) conds.push(eq(media.kind, params.kind));
  if (params.search && params.search.trim()) {
    const term = `%${params.search.trim()}%`;
    conds.push(or(like(media.filename, term), like(media.alt, term)) as SQL);
  }
  const where = and(...conds);

  const totalRow = await db.select({ n: count() }).from(media).where(where).get();
  const rows = await db
    .select()
    .from(media)
    .where(where)
    .orderBy(desc(media.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return { media: rows.map(toMediaDTO), total: totalRow?.n ?? 0 };
}

async function findMedia(db: DrizzleDb, id: string): Promise<MediaRow> {
  const row = await db.select().from(media).where(eq(media.id, id)).get();
  if (!row) throw notFound("Media not found");
  return row;
}

export async function getMedia(db: DrizzleDb, id: string): Promise<MediaDTO> {
  return toMediaDTO(await findMedia(db, id));
}

// --- direct image upload -----------------------------------------------------

export interface ImageUploadInput {
  filename: string;
  mime: string;
  alt?: string;
  width?: number;
  height?: number;
  /** Content-Length when known, for an early size rejection. */
  declaredLength: number | null;
}

export async function uploadImage(
  db: DrizzleDb,
  env: Env,
  input: ImageUploadInput,
  body: ReadableStream,
  userId: string | undefined,
): Promise<MediaDTO> {
  if (!IMAGE_MIMES.includes(input.mime)) {
    throw unsupportedMediaType(`Unsupported image type "${input.mime}"`);
  }
  if (input.declaredLength !== null && input.declaredLength > MAX_IMAGE_BYTES) {
    throw badRequest("Image exceeds the 25 MB limit");
  }

  const filename = sanitizeFilename(input.filename);
  const id = nanoid();
  const key = mediaKey(id, filename);

  const object = await env.MEDIA.put(key, body, {
    httpMetadata: { contentType: input.mime },
  });
  if (!object) throw badRequest("Upload failed");

  // Defensive: enforce the cap even when no Content-Length was provided up front.
  if (object.size > MAX_IMAGE_BYTES) {
    await env.MEDIA.delete(key);
    throw badRequest("Image exceeds the 25 MB limit");
  }

  const now = Date.now();
  await db
    .insert(media)
    .values({
      id,
      kind: "image",
      filename,
      r2Key: key,
      mime: input.mime,
      size: object.size,
      width: input.width ?? null,
      height: input.height ?? null,
      duration: null,
      alt: input.alt?.trim() || null,
      status: "ready",
      uploadId: null,
      createdAt: now,
      createdBy: userId ?? null,
    })
    .run();

  return getMedia(db, id);
}

// --- server-side fetch upload (MCP) ------------------------------------------

export interface UploadFromUrlInput {
  url: string;
  alt?: string;
  filename?: string;
}

/**
 * Fetch a remote asset into R2, streamed (never buffered). The kind is inferred from the
 * response Content-Type against the same allowlists as direct uploads, and the size cap is
 * enforced both up front (Content-Length) and after the put. Powers the MCP
 * `upload_media_from_url` tool so an AI can populate imagery.
 */
export async function uploadMediaFromUrl(
  db: DrizzleDb,
  env: Env,
  input: UploadFromUrlInput,
  userId: string | undefined,
): Promise<MediaDTO> {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw badRequest("`url` must be an absolute http(s) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw badRequest("`url` must use http or https");
  }

  const res = await fetch(parsed.toString(), { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw badRequest(`Could not fetch the URL (HTTP ${res.status})`);
  }

  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  let kind: MediaKind;
  if (IMAGE_MIMES.includes(mime)) kind = "image";
  else if (VIDEO_MIMES.includes(mime)) kind = "video";
  else {
    throw unsupportedMediaType(
      `Unsupported content type "${mime || "unknown"}". Allowed: ${[...IMAGE_MIMES, ...VIDEO_MIMES].join(", ")}`,
    );
  }

  const cap = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  const capLabel = kind === "image" ? "25 MB" : "2 GB";
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) {
    throw badRequest(`Asset exceeds the ${capLabel} limit`);
  }

  const fromPath = decodeURIComponent(parsed.pathname.split("/").pop() ?? "");
  const filename = sanitizeFilename(input.filename || fromPath || `download-${kind}`);
  const id = nanoid();
  const key = mediaKey(id, filename);

  const object = await env.MEDIA.put(key, res.body, { httpMetadata: { contentType: mime } });
  if (!object) throw badRequest("Upload failed");
  if (object.size > cap) {
    await env.MEDIA.delete(key);
    throw badRequest(`Asset exceeds the ${capLabel} limit`);
  }

  const now = Date.now();
  await db
    .insert(media)
    .values({
      id,
      kind,
      filename,
      r2Key: key,
      mime,
      size: object.size,
      width: null,
      height: null,
      duration: null,
      alt: input.alt?.trim() || null,
      status: "ready",
      uploadId: null,
      createdAt: now,
      createdBy: userId ?? null,
    })
    .run();

  return getMedia(db, id);
}

// --- multipart video upload --------------------------------------------------

export interface InitVideoInput {
  filename: string;
  mime: string;
  size: number;
}

export async function initVideoUpload(
  db: DrizzleDb,
  env: Env,
  input: InitVideoInput,
  userId: string | undefined,
): Promise<{ mediaId: string; uploadId: string; partSize: number }> {
  if (!VIDEO_MIMES.includes(input.mime)) {
    throw unsupportedMediaType(`Unsupported video type "${input.mime}"`);
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw badRequest("A positive `size` is required");
  }
  if (input.size > MAX_VIDEO_BYTES) {
    throw badRequest("Video exceeds the 2 GB limit");
  }

  const filename = sanitizeFilename(input.filename);
  const id = nanoid();
  const key = mediaKey(id, filename);

  const upload = await env.MEDIA.createMultipartUpload(key, {
    httpMetadata: { contentType: input.mime },
  });

  const now = Date.now();
  await db
    .insert(media)
    .values({
      id,
      kind: "video",
      filename,
      r2Key: key,
      mime: input.mime,
      size: input.size,
      width: null,
      height: null,
      duration: null,
      alt: null,
      status: "uploading",
      uploadId: upload.uploadId,
      createdAt: now,
      createdBy: userId ?? null,
    })
    .run();

  return { mediaId: id, uploadId: upload.uploadId, partSize: PART_SIZE };
}

function expectedPartLength(totalSize: number, partNumber: number): number {
  const totalParts = Math.max(1, Math.ceil(totalSize / PART_SIZE));
  if (partNumber < 1 || partNumber > totalParts) return -1;
  return partNumber < totalParts ? PART_SIZE : totalSize - (totalParts - 1) * PART_SIZE;
}

async function loadUploading(db: DrizzleDb, mediaId: string, uploadId: string): Promise<MediaRow> {
  const row = await findMedia(db, mediaId);
  if (row.status !== "uploading" || row.uploadId !== uploadId) {
    throw conflict("This upload is no longer in progress");
  }
  return row;
}

export async function uploadVideoPart(
  db: DrizzleDb,
  env: Env,
  args: { mediaId: string; uploadId: string; partNumber: number; contentLength: number | null },
  body: ReadableStream,
): Promise<UploadedPart> {
  const row = await loadUploading(db, args.mediaId, args.uploadId);

  // R2 requires every part except the last to be the same size (≥5 MiB). We know the
  // declared total size, so we can compute the exact expected length per part and reject
  // a mismatch up front rather than failing opaquely at completion.
  const expected = expectedPartLength(row.size, args.partNumber);
  if (expected < 0) throw badRequest(`Part number ${args.partNumber} is out of range`);
  if (args.contentLength !== null && args.contentLength !== expected) {
    throw badRequest(
      `Part ${args.partNumber} must be ${expected} bytes, received ${args.contentLength}`,
    );
  }

  const upload = env.MEDIA.resumeMultipartUpload(row.r2Key, args.uploadId);
  const uploaded = await upload.uploadPart(args.partNumber, body);
  return { partNumber: uploaded.partNumber, etag: uploaded.etag };
}

export interface CompleteVideoInput {
  uploadId: string;
  parts: UploadedPart[];
  width?: number;
  height?: number;
  duration?: number;
}

export async function completeVideoUpload(
  db: DrizzleDb,
  env: Env,
  mediaId: string,
  input: CompleteVideoInput,
): Promise<MediaDTO> {
  const row = await loadUploading(db, mediaId, input.uploadId);
  if (!Array.isArray(input.parts) || input.parts.length === 0) {
    throw badRequest("`parts` must be a non-empty array");
  }
  const parts = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);

  const upload = env.MEDIA.resumeMultipartUpload(row.r2Key, input.uploadId);
  let object;
  try {
    object = await upload.complete(parts);
  } catch {
    throw badRequest("Could not assemble the upload — parts are missing or the wrong size");
  }

  const now = Date.now();
  await db
    .update(media)
    .set({
      status: "ready",
      uploadId: null,
      size: object.size,
      width: input.width ?? null,
      height: input.height ?? null,
      duration: input.duration ?? null,
      createdAt: now,
    })
    .where(eq(media.id, mediaId))
    .run();

  return getMedia(db, mediaId);
}

export async function abortVideoUpload(
  db: DrizzleDb,
  env: Env,
  mediaId: string,
  uploadId: string,
): Promise<void> {
  const row = await loadUploading(db, mediaId, uploadId);
  try {
    await env.MEDIA.resumeMultipartUpload(row.r2Key, uploadId).abort();
  } catch {
    // Best effort — the row is removed regardless so the half-upload can't linger.
  }
  await db.delete(media).where(eq(media.id, mediaId)).run();
}

// --- update / delete ---------------------------------------------------------

export async function updateMedia(db: DrizzleDb, id: string, patch: { alt?: string | null }): Promise<MediaDTO> {
  await findMedia(db, id);
  const values: Partial<typeof media.$inferInsert> = {};
  if (patch.alt !== undefined) {
    const alt = typeof patch.alt === "string" ? patch.alt.trim() : "";
    values.alt = alt || null;
  }
  if (Object.keys(values).length > 0) {
    await db.update(media).set(values).where(eq(media.id, id)).run();
  }
  return getMedia(db, id);
}

export async function deleteMedia(db: DrizzleDb, env: Env, id: string): Promise<void> {
  const row = await findMedia(db, id);
  if (row.status === "uploading" && row.uploadId) {
    try {
      await env.MEDIA.resumeMultipartUpload(row.r2Key, row.uploadId).abort();
    } catch {
      /* ignore — fall through to object delete */
    }
  }
  await env.MEDIA.delete(row.r2Key);
  await db.delete(media).where(eq(media.id, id)).run();
}

// --- usage scan --------------------------------------------------------------

function titleFromDraft(draft: string, titleField: string | null): string {
  if (!titleField) return "Untitled";
  try {
    const data = JSON.parse(draft) as EntryData;
    const v = data[titleField];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
  } catch {
    /* fall through */
  }
  return "Untitled";
}

/** Entries that reference this media id in their draft or published JSON (LIKE scan). */
export async function getMediaUsage(db: DrizzleDb, id: string): Promise<MediaUsage> {
  await findMedia(db, id);
  // Ids are stored as a quoted JSON string value, so match `"<id>"` to avoid substring hits.
  const needle = `%"${id}"%`;
  const rows = await db
    .select({
      entryId: entries.id,
      draftData: entries.draftData,
      collectionSlug: collections.slug,
      collectionName: collections.name,
      titleField: collections.titleField,
    })
    .from(entries)
    .innerJoin(collections, eq(entries.collectionId, collections.id))
    .where(or(like(entries.draftData, needle), like(entries.publishedData, needle)))
    .orderBy(asc(collections.name))
    .all();

  return {
    entries: rows.map((r) => ({
      entryId: r.entryId,
      collectionSlug: r.collectionSlug,
      collectionName: r.collectionName,
      title: titleFromDraft(r.draftData, r.titleField),
    })),
  };
}

// --- entry write-time ref validation ----------------------------------------

/**
 * Validate that every picture/video value points at an existing, ready asset of the right
 * kind. Called by the entries service on write; throws fieldErrors keyed by field name.
 */
export async function assertMediaRefs(
  db: DrizzleDb,
  defs: FieldDefinition[],
  data: EntryData,
): Promise<void> {
  const refs: { field: string; id: string; kind: MediaKind }[] = [];
  for (const def of defs) {
    if (def.type !== "picture" && def.type !== "video") continue;
    const value = data[def.name];
    if (typeof value === "string" && value) {
      refs.push({ field: def.name, id: value, kind: def.type === "picture" ? "image" : "video" });
    }
  }
  if (refs.length === 0) return;

  const byId = await fetchMediaByIds(db, refs.map((r) => r.id));
  const fieldErrors: Record<string, string> = {};
  for (const ref of refs) {
    const row = byId.get(ref.id);
    if (!row || row.status !== "ready") {
      fieldErrors[ref.field] = "Selected media no longer exists";
    } else if (row.kind !== ref.kind) {
      fieldErrors[ref.field] = `Expected ${ref.kind === "image" ? "an image" : "a video"}`;
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    throw validationError("Some media references are invalid", fieldErrors);
  }
}
