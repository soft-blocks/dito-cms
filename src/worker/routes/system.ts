import { Hono } from "hono";
import { count } from "drizzle-orm";

import { user } from "../db/auth-schema";
import type { AppEnv } from "../lib/app";

import type { HealthStatus, SetupStatus } from "@/shared/api-types";
import { APP_NAME, APP_VERSION } from "@/shared/constants";


export const systemRouter = new Hono<AppEnv>();

// Public: tells the SPA whether to route first-run setup or normal login.
systemRouter.get("/setup/status", async (c) => {
  const row = await c.get("db").select({ value: count() }).from(user).get();
  return c.json({ initialized: (row?.value ?? 0) > 0 } satisfies SetupStatus);
});

// Public health probe.
systemRouter.get("/health", (c) =>
  c.json({ ok: true, name: APP_NAME, version: APP_VERSION } satisfies HealthStatus),
);
