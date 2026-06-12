import { and, asc, count, desc, eq, isNotNull, or, sql, type SQL } from "drizzle-orm";

import type { DrizzleDb } from "../db/client";
import { collections, entries, fields, type CollectionRow, type EntryRow } from "../db/schema";
import { hashString } from "../lib/hash";
import { badRequest, notFound } from "../lib/errors";
import { fetchMediaByIds, toDeliveryMedia } from "./media";

import { FIELD_TYPES, parseFieldOptions, type FieldOptions } from "@/shared/field-types";
import type { FieldDefinition } from "@/shared/validation";
import type {
  DeliveryCollectionSchema,
  DeliveryEntry,
  DeliveryListResponse,
  EntryData,
} from "@/shared/api-types";

// Read-only delivery (the public `/api/v1/*` API). Serves ONLY published content and
// normalizes every entry to the collection's current field set so schema changes never
// corrupt old rows: removed fields drop out, added fields appear as `default ?? null`.

const FILTER_OPS = ["eq", "ne", "lt", "lte", "gt", "gte", "contains"] as const;
type FilterOp = (typeof FILTER_OPS)[number];

export interface RawFilter {
  field: string;
  op: string;
  value: string;
}

export interface ContentQuery {
  limit: number;
  offset: number;
  sort?: string;
  filters: RawFilter[];
}

export interface DeliveryCollection {
  collection: CollectionRow;
  defs: FieldDefinition[];
}

function parseJson(text: string): EntryData {
  try {
    return JSON.parse(text) as EntryData;
  } catch {
    return {};
  }
}

async function loadDefs(db: DrizzleDb, collectionId: string): Promise<FieldDefinition[]> {
  const rows = await db
    .select()
    .from(fields)
    .where(eq(fields.collectionId, collectionId))
    .orderBy(asc(fields.sortOrder))
    .all();
  return rows.map((r) => {
    let options: FieldOptions = {};
    try {
      options = parseFieldOptions(r.type, JSON.parse(r.options));
    } catch {
      options = {};
    }
    return { name: r.name, type: r.type, options };
  });
}

export async function loadDeliveryCollection(db: DrizzleDb, slug: string): Promise<DeliveryCollection> {
  const collection = await db.select().from(collections).where(eq(collections.slug, slug)).get();
  if (!collection) throw notFound(`No collection "${slug}"`);
  return { collection, defs: await loadDefs(db, collection.id) };
}

/** Emit exactly the currently-defined fields, with stable defaults for missing values. */
function normalizeForDelivery(defs: FieldDefinition[], data: EntryData): EntryData {
  const out: EntryData = {};
  for (const def of defs) {
    if (def.name in data && data[def.name] !== undefined) {
      out[def.name] = data[def.name];
    } else {
      const fallback = FIELD_TYPES[def.type].resolveDefault(def.options);
      out[def.name] = fallback === undefined ? null : fallback;
    }
  }
  return out;
}

function toDeliveryEntry(row: EntryRow, defs: FieldDefinition[]): DeliveryEntry {
  return {
    id: row.id,
    slug: row.slug,
    sortOrder: row.sortOrder,
    publishedAt: row.publishedAt,
    data: normalizeForDelivery(defs, parseJson(row.publishedData ?? "{}")),
  };
}

function entryEtag(row: EntryRow): string {
  const tag = row.publishedEtag ?? hashString(row.publishedData ?? "");
  return `W/"${tag}"`;
}

/**
 * Replace every picture/video value (a bare media id) with an expanded media object
 * carrying an absolute URL, or `null` when the asset is gone or not ready. One batched
 * lookup covers all entries in the response (chunked IN under D1's param ceiling).
 */
async function expandMedia(
  db: DrizzleDb,
  origin: string,
  defs: FieldDefinition[],
  list: DeliveryEntry[],
): Promise<void> {
  const mediaFields = defs.filter((d) => d.type === "picture" || d.type === "video");
  if (mediaFields.length === 0) return;

  const ids: string[] = [];
  for (const entry of list) {
    for (const def of mediaFields) {
      const v = entry.data[def.name];
      if (typeof v === "string" && v) ids.push(v);
    }
  }
  if (ids.length === 0) return;

  const byId = await fetchMediaByIds(db, ids);
  for (const entry of list) {
    for (const def of mediaFields) {
      const v = entry.data[def.name];
      if (typeof v === "string" && v) {
        const row = byId.get(v);
        entry.data[def.name] = row && row.status === "ready" ? toDeliveryMedia(origin, row) : null;
      }
    }
  }
}

// --- public schema -----------------------------------------------------------

export async function getPublicSchema(db: DrizzleDb): Promise<DeliveryCollectionSchema[]> {
  const cols = await db
    .select()
    .from(collections)
    .orderBy(asc(collections.sortOrder), asc(collections.createdAt))
    .all();
  const result: DeliveryCollectionSchema[] = [];
  for (const col of cols) {
    const fieldRows = await db
      .select()
      .from(fields)
      .where(eq(fields.collectionId, col.id))
      .orderBy(asc(fields.sortOrder))
      .all();
    result.push({
      slug: col.slug,
      name: col.name,
      description: col.description,
      type: col.type,
      titleField: col.titleField,
      fields: fieldRows.map((f) => {
        let options: FieldOptions = {};
        try {
          options = parseFieldOptions(f.type, JSON.parse(f.options));
        } catch {
          options = {};
        }
        return { name: f.name, label: f.label, type: f.type, options };
      }),
    });
  }
  return result;
}

// --- filtering + sorting -----------------------------------------------------

function jsonExtract(field: string): SQL {
  return sql`json_extract(${entries.publishedData}, ${"$." + field})`;
}

function compileFilter(def: FieldDefinition, op: FilterOp, rawValue: string): SQL {
  const expr = jsonExtract(def.name);
  if (op === "contains") return sql`${expr} LIKE ${"%" + rawValue + "%"}`;

  let value: string | number = rawValue;
  if (def.type === "number") {
    const num = Number(rawValue);
    if (!Number.isFinite(num)) throw badRequest(`Filter value for "${def.name}" must be a number`);
    value = num;
  } else if (def.type === "boolean") {
    value = rawValue === "true" || rawValue === "1" ? 1 : 0;
  }

  switch (op) {
    case "eq":
      return sql`${expr} = ${value}`;
    case "ne":
      return sql`${expr} != ${value}`;
    case "lt":
      return sql`${expr} < ${value}`;
    case "lte":
      return sql`${expr} <= ${value}`;
    case "gt":
      return sql`${expr} > ${value}`;
    case "gte":
      return sql`${expr} >= ${value}`;
  }
}

function buildFilters(defs: FieldDefinition[], filters: RawFilter[]): SQL[] {
  const byName = new Map(defs.map((d) => [d.name, d]));
  return filters.map((f) => {
    const def = byName.get(f.field);
    if (!def) throw badRequest(`Unknown filter field "${f.field}"`);
    if (!FILTER_OPS.includes(f.op as FilterOp)) throw badRequest(`Unknown filter operator "${f.op}"`);
    return compileFilter(def, f.op as FilterOp, f.value);
  });
}

function buildSort(defs: FieldDefinition[], sort: string | undefined): SQL {
  if (!sort) return asc(entries.sortOrder);
  const dir = sort.startsWith("-") ? "desc" : "asc";
  const field = sort.replace(/^-/, "");
  let expr: SQL;
  if (field === "sortOrder") expr = sql`${entries.sortOrder}`;
  else if (field === "publishedAt") expr = sql`${entries.publishedAt}`;
  else if (field === "createdAt") expr = sql`${entries.createdAt}`;
  else if (defs.some((d) => d.name === field)) expr = jsonExtract(field);
  else throw badRequest(`Unknown sort field "${field}"`);
  return dir === "desc" ? desc(expr) : asc(expr);
}

// --- queries -----------------------------------------------------------------

export async function queryCollectionContent(
  db: DrizzleDb,
  origin: string,
  { collection, defs }: DeliveryCollection,
  query: ContentQuery,
): Promise<{ response: DeliveryListResponse; etag: string }> {
  const conds = [eq(entries.collectionId, collection.id), isNotNull(entries.publishedData)];
  for (const filter of buildFilters(defs, query.filters)) conds.push(filter);
  const where = and(...conds);

  const totalRow = await db.select({ n: count() }).from(entries).where(where).get();
  const rows = await db
    .select()
    .from(entries)
    .where(where)
    .orderBy(buildSort(defs, query.sort))
    .limit(query.limit)
    .offset(query.offset)
    .all();

  const data = rows.map((r) => toDeliveryEntry(r, defs));
  await expandMedia(db, origin, defs, data);

  // ETag changes when the collection's content changes (content_version) OR when the
  // query shape changes — so two different filters never share a 304.
  const queryKey = `${query.limit}:${query.offset}:${query.sort ?? ""}:${query.filters
    .map((f) => `${f.field}.${f.op}=${f.value}`)
    .join("&")}`;
  const etag = `W/"${collection.slug}-${collection.contentVersion}-${hashString(queryKey)}"`;

  return {
    response: {
      data,
      meta: { total: totalRow?.n ?? 0, limit: query.limit, offset: query.offset },
    },
    etag,
  };
}

export async function getSingletonContent(
  db: DrizzleDb,
  origin: string,
  { collection, defs }: DeliveryCollection,
): Promise<{ data: DeliveryEntry; etag: string }> {
  const row = await db
    .select()
    .from(entries)
    .where(and(eq(entries.collectionId, collection.id), isNotNull(entries.publishedData)))
    .orderBy(asc(entries.createdAt))
    .limit(1)
    .get();
  if (!row) throw notFound("Not published");
  const data = toDeliveryEntry(row, defs);
  await expandMedia(db, origin, defs, [data]);
  return { data, etag: entryEtag(row) };
}

export async function getContentItem(
  db: DrizzleDb,
  origin: string,
  { collection, defs }: DeliveryCollection,
  idOrSlug: string,
): Promise<{ data: DeliveryEntry; etag: string }> {
  const row = await db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.collectionId, collection.id),
        isNotNull(entries.publishedData),
        or(eq(entries.id, idOrSlug), eq(entries.slug, idOrSlug)),
      ),
    )
    .get();
  if (!row) throw notFound("Not found");
  const data = toDeliveryEntry(row, defs);
  await expandMedia(db, origin, defs, [data]);
  return { data, etag: entryEtag(row) };
}
