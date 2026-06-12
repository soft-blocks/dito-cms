import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AppEnv } from "../lib/app";
import {
  getContentItem,
  getPublicSchema,
  getSingletonContent,
  loadDeliveryCollection,
  queryCollectionContent,
  type RawFilter,
} from "../services/delivery";

import { MAX_DELIVERY_LIMIT } from "@/shared/constants";

// Public delivery API at /api/v1/*. CORS open to any origin (read-only verbs); serves
// published content with ETag / Cache-Control so CDNs and clients can cache + revalidate.
export const deliveryRouter = new Hono<AppEnv>();

const CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

deliveryRouter.use(
  "*",
  cors({ origin: "*", allowMethods: ["GET", "HEAD", "OPTIONS"], maxAge: 86400 }),
);

/** True when the client's If-None-Match covers our ETag (honor `*` and comma lists). */
function notModified(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((t) => t.trim())
    .some((t) => t === "*" || t === etag);
}

function parseFilters(url: URL): RawFilter[] {
  const filters: RawFilter[] = [];
  for (const [key, value] of url.searchParams) {
    const match = key.match(/^filter\[([^\]]+)\]\[([^\]]+)\]$/);
    if (match) filters.push({ field: match[1], op: match[2], value });
  }
  return filters;
}

function parseInt0(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

// Public schema (collections + field defs) for typed clients.
deliveryRouter.get("/collections", async (c) => {
  const collections = await getPublicSchema(c.get("db"));
  c.header("Cache-Control", CACHE_CONTROL);
  return c.json({ collections });
});

// Collection → paginated list; singleton → the single published object.
deliveryRouter.get("/content/:slug", async (c) => {
  const loaded = await loadDeliveryCollection(c.get("db"), c.req.param("slug"));

  if (loaded.collection.type === "singleton") {
    const { data, etag } = await getSingletonContent(c.get("db"), c.get("origin"), loaded);
    c.header("ETag", etag);
    c.header("Cache-Control", CACHE_CONTROL);
    if (notModified(c.req.header("If-None-Match"), etag)) return c.body(null, 304);
    return c.json({ data });
  }

  const url = new URL(c.req.url);
  const limit = Math.min(Math.max(parseInt0(url.searchParams.get("limit"), 20), 1), MAX_DELIVERY_LIMIT);
  const offset = Math.max(parseInt0(url.searchParams.get("offset"), 0), 0);
  const { response, etag } = await queryCollectionContent(c.get("db"), c.get("origin"), loaded, {
    limit,
    offset,
    sort: url.searchParams.get("sort") ?? undefined,
    filters: parseFilters(url),
  });
  c.header("ETag", etag);
  c.header("Cache-Control", CACHE_CONTROL);
  if (notModified(c.req.header("If-None-Match"), etag)) return c.body(null, 304);
  return c.json(response);
});

// A single published entry by id or slug.
deliveryRouter.get("/content/:slug/:idOrSlug", async (c) => {
  const loaded = await loadDeliveryCollection(c.get("db"), c.req.param("slug"));
  const { data, etag } = await getContentItem(c.get("db"), c.get("origin"), loaded, c.req.param("idOrSlug"));
  c.header("ETag", etag);
  c.header("Cache-Control", CACHE_CONTROL);
  if (notModified(c.req.header("If-None-Match"), etag)) return c.body(null, 304);
  return c.json({ data });
});
