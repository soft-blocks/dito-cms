import { Hono } from "hono";

import type { AppEnv } from "../lib/app";
import type { DrizzleDb } from "../db/client";
import { getSetting, setSetting } from "../services/settings";

import { APP_NAME } from "@/shared/constants";
import type { ProjectSettings } from "@/shared/api-types";

// Editable instance settings, mounted under /api/admin/settings (auth applied upstream).
// v1 holds only the project name; the key/value `settings` table makes adding more trivial.
export const settingsRouter = new Hono<AppEnv>();

async function readProjectName(db: DrizzleDb): Promise<string> {
  return (await getSetting(db, "project_name")) ?? APP_NAME;
}

settingsRouter.get("/", async (c) => {
  return c.json({ projectName: await readProjectName(c.get("db")) } satisfies ProjectSettings);
});

settingsRouter.patch("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.projectName === "string") {
    await setSetting(c.get("db"), "project_name", body.projectName.trim() || APP_NAME);
  }
  return c.json({ projectName: await readProjectName(c.get("db")) } satisfies ProjectSettings);
});
