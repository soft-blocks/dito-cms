import { Hono } from "hono";
import type { Context } from "hono";

import type { AppEnv } from "../lib/app";
import { badRequest } from "../lib/errors";
import {
  getRedactedDeployHook,
  setDeployHookConfig,
  triggerDeployHook,
  validateHookUrl,
} from "../services/deploy-hook";

import type { UpdateDeployHookInput } from "@/shared/api-types";

// Admin endpoints for the deploy hook, mounted under /api/admin/deploy-hook (auth applied
// upstream by adminRouter). GET/PATCH return only a REDACTED view — the hook URL and auth
// header value are write-only and never travel back to the browser.
export const deployHookRouter = new Hono<AppEnv>();

deployHookRouter.get("/", async (c) => {
  return c.json(await getRedactedDeployHook(c.get("db")));
});

deployHookRouter.patch("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: UpdateDeployHookInput = {};

  if ("url" in body) {
    if (typeof body.url !== "string") throw badRequest("`url` must be a string");
    const url = body.url.trim();
    // A non-empty url must validate; an empty url clears the config (handled in the service).
    if (url !== "") {
      const err = validateHookUrl(url);
      if (err) throw badRequest(err, { url: err });
    }
    patch.url = url;
  }
  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") throw badRequest("`enabled` must be a boolean");
    patch.enabled = body.enabled;
  }
  if ("authHeaderName" in body) {
    patch.authHeaderName = typeof body.authHeaderName === "string" ? body.authHeaderName : null;
  }
  if ("authHeaderValue" in body) {
    patch.authHeaderValue = typeof body.authHeaderValue === "string" ? body.authHeaderValue : null;
  }

  await setDeployHookConfig(c.get("db"), patch);
  return c.json(await getRedactedDeployHook(c.get("db")));
});

deployHookRouter.post("/test", async (c) => {
  return c.json(await triggerDeployHook(c.get("db")));
});

/**
 * Fire the deploy hook for a published-content change, fire-and-forget. Runs in
 * `waitUntil` so it never blocks or fails the mutation response — the trigger must be
 * invisible to the editor. Mirrors the defensive waitUntil try/catch in media.ts.
 */
export function fireDeployHook(c: Context<AppEnv>): void {
  const p = triggerDeployHook(c.get("db")).catch(() => {
    /* triggerDeployHook never rejects, but guard anyway */
  });
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    /* dev: no execution context → let it run detached */
  }
}
