import { Hono } from "hono";

import type { AppEnv } from "../lib/app";
import { applyImport, exportProject, previewImport } from "../services/import-export";

import type { ImportResolution } from "@/shared/api-types";

// Whole-project backup: export the content model (optionally with data) and import it back.
// Mounted under /api/admin/backup; auth is applied by the parent adminRouter. The service
// owns all validation — these handlers stay thin.
export const backupRouter = new Hono<AppEnv>();

backupRouter.get("/export", async (c) => {
  const includeData = c.req.query("data") === "true";
  return c.json(await exportProject(c.get("db"), includeData));
});

backupRouter.post("/import/preview", async (c) => {
  const body = await c.req.json().catch(() => null);
  return c.json(await previewImport(c.get("db"), body));
});

backupRouter.post("/import", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { document?: unknown; resolutions?: unknown };
  const resolutions = (body.resolutions ?? {}) as Record<string, ImportResolution>;
  return c.json(await applyImport(c.get("db"), body.document, resolutions, c.get("authUserId")));
});
