import { Hono } from "hono";

import type { AppEnv } from "../lib/app";
import { badRequest } from "../lib/errors";
import {
  abortVideoUpload,
  completeVideoUpload,
  deleteMedia,
  getMedia,
  getMediaUsage,
  initVideoUpload,
  listMedia,
  updateMedia,
  uploadImage,
  uploadVideoPart,
} from "../services/media";

import type { MediaKind, UploadedPart } from "@/shared/api-types";

// Admin media endpoints, mounted under /api/admin/media (auth already applied upstream).
// Multipart (video) routes are registered before the bare `/:id` routes so their static
// `/multipart` segment is never shadowed.
export const mediaRouter = new Hono<AppEnv>();

function intParam(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function parseKind(value: string | undefined): MediaKind | undefined {
  return value === "image" || value === "video" ? value : undefined;
}

function contentLength(c: { req: { header: (k: string) => string | undefined } }): number | null {
  const raw = c.req.header("content-length");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// --- list --------------------------------------------------------------------

mediaRouter.get("/", async (c) => {
  const result = await listMedia(c.get("db"), {
    kind: parseKind(c.req.query("kind")),
    search: c.req.query("search") ?? undefined,
    limit: intParam(c.req.query("limit")),
    offset: intParam(c.req.query("offset")),
  });
  return c.json(result);
});

// --- direct image upload -----------------------------------------------------
// Raw image bytes streamed straight to R2 (never buffered). Metadata in the query string.

mediaRouter.post("/", async (c) => {
  const filename = c.req.query("filename");
  if (!filename) throw badRequest("`filename` query parameter is required");
  const mime = c.req.query("mime") ?? c.req.header("content-type") ?? "";
  const body = c.req.raw.body;
  if (!body) throw badRequest("Request body is required");

  const media = await uploadImage(
    c.get("db"),
    c.env,
    {
      filename,
      mime,
      alt: c.req.query("alt") ?? undefined,
      width: intParam(c.req.query("width")),
      height: intParam(c.req.query("height")),
      declaredLength: contentLength(c),
    },
    body,
    c.get("authUserId"),
  );
  return c.json({ media }, 201);
});

// --- multipart video upload --------------------------------------------------

mediaRouter.post("/multipart", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.filename !== "string" || typeof body.mime !== "string" || typeof body.size !== "number") {
    throw badRequest("`filename`, `mime` and `size` are required");
  }
  const init = await initVideoUpload(
    c.get("db"),
    c.env,
    { filename: body.filename, mime: body.mime, size: body.size },
    c.get("authUserId"),
  );
  return c.json(init, 201);
});

mediaRouter.put("/multipart/:mediaId/parts/:n", async (c) => {
  const uploadId = c.req.query("uploadId");
  if (!uploadId) throw badRequest("`uploadId` query parameter is required");
  const partNumber = Number(c.req.param("n"));
  if (!Number.isInteger(partNumber) || partNumber < 1) throw badRequest("Invalid part number");
  const body = c.req.raw.body;
  if (!body) throw badRequest("Request body is required");

  const part = await uploadVideoPart(
    c.get("db"),
    c.env,
    { mediaId: c.req.param("mediaId"), uploadId, partNumber, contentLength: contentLength(c) },
    body,
  );
  return c.json(part);
});

mediaRouter.post("/multipart/:mediaId/complete", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.uploadId !== "string" || !Array.isArray(body.parts)) {
    throw badRequest("`uploadId` and `parts` are required");
  }
  const media = await completeVideoUpload(c.get("db"), c.env, c.req.param("mediaId"), {
    uploadId: body.uploadId,
    parts: body.parts as UploadedPart[],
    width: typeof body.width === "number" ? body.width : undefined,
    height: typeof body.height === "number" ? body.height : undefined,
    duration: typeof body.duration === "number" ? body.duration : undefined,
  });
  return c.json({ media });
});

mediaRouter.delete("/multipart/:mediaId", async (c) => {
  const uploadId = c.req.query("uploadId");
  if (!uploadId) throw badRequest("`uploadId` query parameter is required");
  await abortVideoUpload(c.get("db"), c.env, c.req.param("mediaId"), uploadId);
  return c.body(null, 204);
});

// --- single item: usage / get / patch / delete -------------------------------

mediaRouter.get("/:id/usage", async (c) => {
  return c.json(await getMediaUsage(c.get("db"), c.req.param("id")));
});

mediaRouter.get("/:id", async (c) => {
  return c.json({ media: await getMedia(c.get("db"), c.req.param("id")) });
});

mediaRouter.patch("/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: { alt?: string | null } = {};
  if ("alt" in body) patch.alt = typeof body.alt === "string" ? body.alt : null;
  const media = await updateMedia(c.get("db"), c.req.param("id"), patch);
  return c.json({ media });
});

mediaRouter.delete("/:id", async (c) => {
  await deleteMedia(c.get("db"), c.env, c.req.param("id"));
  return c.body(null, 204);
});
