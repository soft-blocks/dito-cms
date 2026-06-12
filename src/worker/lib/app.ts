import { createMiddleware } from "hono/factory";
import type { Context } from "hono";

import { createDb, type DrizzleDb } from "../db/client";
import { createAuth, type Auth } from "../auth";

export interface AppVariables {
  db: DrizzleDb;
  origin: string;
  /** Built lazily via getAuth() — public routes (delivery, media) never pay for it. */
  auth?: Auth;
  /** Set by requireAuth once a request is authenticated. */
  authUserId?: string;
  authVia?: "session" | "apikey";
}

export type AppEnv = { Bindings: Env; Variables: AppVariables };

/** Attach a request-scoped Drizzle client and the request origin. Cheap (no queries). */
export const baseMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set("db", createDb(c.env.DB));
  c.set("origin", new URL(c.req.url).origin);
  await next();
});

/** Build (and cache for this request) the Better Auth instance. */
export async function getAuth(c: Context<AppEnv>): Promise<Auth> {
  const existing = c.get("auth");
  if (existing) return existing;
  const auth = await createAuth(c.get("db"), c.env, c.get("origin"));
  c.set("auth", auth);
  return auth;
}
