import { desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { DrizzleDb } from "../db/client";
import { deployHookDeliveries } from "../db/schema";
import { getSetting, setSetting } from "./settings";

import type {
  DeployHookActivity,
  DeployHookDelivery,
  DeployHookSettings,
  DeployHookTestResult,
  UpdateDeployHookInput,
} from "@/shared/api-types";

// Admin-configurable webhook fired whenever PUBLISHED content changes, so a consuming site
// (e.g. a Cloudflare Pages/Workers build) can rebuild. Modeled on the Cloudflare deploy-hook
// contract: POST to a unique URL, no body — "the unique identifier embedded in the URL acts
// as the authentication credential." The URL is therefore treated as a secret: stored
// server-side in D1 (the same trust boundary as the Better Auth secret and hashed API keys)
// and never returned to the browser — GET/PATCH expose only a masked preview.
//
// Framework-free (db-only), mirroring services/settings.ts. The Hono-aware fire-and-forget
// wrapper (`fireDeployHook`) lives in routes/admin-deploy-hook.ts so Hono stays out of here.

const CONFIG_KEY = "deploy_hook";
const TIMEOUT_MS = 10_000;
/** How many delivery rows to retain; older rows are pruned on each insert. */
const MAX_DELIVERIES = 50;
/** Default page size for the activity list. */
const DEFAULT_LIST_LIMIT = 20;

/**
 * What triggered a delivery. `event` is a stable machine string (the UI maps it to a
 * localized label); `detail` is an optional human reference such as a collection or entry
 * slug. Supplied by the route layer — see fireDeployHook in routes/admin-deploy-hook.ts.
 */
export interface DeployHookTrigger {
  event: string;
  detail?: string | null;
}

/** The secret config persisted under `deploy_hook`. Never sent to the browser as-is. */
interface DeployHookConfig {
  url: string;
  authHeaderName?: string;
  authHeaderValue?: string;
  enabled: boolean;
}

const EMPTY_CONFIG: DeployHookConfig = { url: "", enabled: false };

function parseConfig(raw: string | undefined): DeployHookConfig {
  if (!raw) return { ...EMPTY_CONFIG };
  try {
    const parsed = JSON.parse(raw) as Partial<DeployHookConfig>;
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      authHeaderName: typeof parsed.authHeaderName === "string" ? parsed.authHeaderName : undefined,
      authHeaderValue:
        typeof parsed.authHeaderValue === "string" ? parsed.authHeaderValue : undefined,
      enabled: parsed.enabled === true,
    };
  } catch {
    return { ...EMPTY_CONFIG };
  }
}

export async function getDeployHookConfig(db: DrizzleDb): Promise<DeployHookConfig> {
  return parseConfig(await getSetting(db, CONFIG_KEY));
}

/**
 * Merge a PATCH into the stored config. Omitted field = unchanged (so `enabled` can toggle
 * without resending the secret). An explicit empty-string `url` clears the whole config.
 * An auth header needs both a name and a value; if either ends up missing, both are dropped
 * so the stored shape is always consistent (and `hasAuthHeader` is unambiguous).
 */
export async function setDeployHookConfig(
  db: DrizzleDb,
  patch: UpdateDeployHookInput,
): Promise<DeployHookConfig> {
  // An explicit empty-string url removes the secret entirely (rotation/removal).
  if (patch.url !== undefined && patch.url.trim() === "") {
    await setSetting(db, CONFIG_KEY, JSON.stringify(EMPTY_CONFIG));
    return { ...EMPTY_CONFIG };
  }

  const next: DeployHookConfig = { ...(await getDeployHookConfig(db)) };
  if (patch.url !== undefined) next.url = patch.url.trim();
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.authHeaderName !== undefined) next.authHeaderName = patch.authHeaderName?.trim() || undefined;
  if (patch.authHeaderValue !== undefined) next.authHeaderValue = patch.authHeaderValue?.trim() || undefined;

  // A header value cannot exist without a name (or vice versa) — keep them paired.
  if (!next.authHeaderName || !next.authHeaderValue) {
    next.authHeaderName = undefined;
    next.authHeaderValue = undefined;
  }

  await setSetting(db, CONFIG_KEY, JSON.stringify(next));
  return next;
}

/**
 * Validate a hook URL before persisting. Must parse; scheme must be `https:`, except
 * `http://localhost` / `http://127.0.0.1` for local dev. Light SSRF/abuse guard — the
 * Workers runtime cannot reach private networks by default, so the surface is small.
 * Returns an error message, or null when valid.
 */
export function validateHookUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Enter a valid URL";
  }
  if (parsed.protocol === "https:") return null;
  if (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) {
    return null;
  }
  return "Hook URL must use https://";
}

/**
 * Fire the hook for a published-content change. No-op (returns ok:false, logs nothing)
 * when disabled or unconfigured. POSTs with no body (Cloudflare contract) and applies the
 * optional auth header. Logs the attempt — trigger event + masked URL + outcome — to the
 * activity table (deploy_hook_deliveries). NEVER throws: a delivery or logging failure must
 * not break the mutation that triggered it.
 */
export async function triggerDeployHook(
  db: DrizzleDb,
  trigger: DeployHookTrigger,
): Promise<DeployHookTestResult> {
  const config = await getDeployHookConfig(db);
  if (!config.enabled || !config.url) {
    return { ok: false, status: null, error: "Deploy hook is disabled or has no URL" };
  }

  const headers = new Headers();
  if (config.authHeaderName && config.authHeaderValue) {
    headers.set(config.authHeaderName, config.authHeaderValue);
  }

  let result: DeployHookTestResult;
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    result = { ok: res.ok, status: res.status };
    if (!res.ok) result.error = `HTTP ${res.status}`;
  } catch (err) {
    result = { ok: false, status: null, error: err instanceof Error ? err.message : "Request failed" };
  }

  try {
    await recordDelivery(db, {
      event: trigger.event,
      detail: trigger.detail ?? null,
      // Store only the MASKED URL — the raw URL is a secret and never lands in the log.
      url: maskUrl(config.url),
      result,
    });
  } catch {
    // Logging is best-effort; never throw from the trigger path.
  }
  return result;
}

/** Insert one delivery row, then prune to the most recent MAX_DELIVERIES rows. */
async function recordDelivery(
  db: DrizzleDb,
  row: { event: string; detail: string | null; url: string; result: DeployHookTestResult },
): Promise<void> {
  await db.insert(deployHookDeliveries).values({
    id: nanoid(),
    firedAt: Date.now(),
    event: row.event,
    detail: row.detail,
    url: row.url,
    ok: row.result.ok,
    status: row.result.status,
    error: row.result.error ?? null,
  });
  await db.run(
    sql`DELETE FROM deploy_hook_deliveries WHERE id NOT IN (
      SELECT id FROM deploy_hook_deliveries ORDER BY fired_at DESC LIMIT ${MAX_DELIVERIES}
    )`,
  );
}

/** Recent delivery attempts, newest first. Masked URLs only — never the raw secret. */
export async function listDeliveries(
  db: DrizzleDb,
  limit: number = DEFAULT_LIST_LIMIT,
): Promise<DeployHookActivity> {
  const rows = await db
    .select()
    .from(deployHookDeliveries)
    .orderBy(desc(deployHookDeliveries.firedAt))
    .limit(limit)
    .all();
  const deliveries: DeployHookDelivery[] = rows.map((r) => ({
    id: r.id,
    firedAt: r.firedAt,
    event: r.event,
    detail: r.detail,
    urlPreview: r.url,
    ok: r.ok,
    status: r.status,
    error: r.error,
  }));
  return { deliveries };
}

/** Mask a stored URL to `scheme://host/…/<last4>` — enough to recognize it, not to use it. */
function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/…/${url.slice(-4)}`;
  } catch {
    return "";
  }
}

/**
 * Build the redacted client DTO. NEVER returns the raw url or auth header value — only the
 * masked preview, the (safe) header name, and the last-delivery status fields.
 */
export async function getRedactedDeployHook(db: DrizzleDb): Promise<DeployHookSettings> {
  const config = await getDeployHookConfig(db);
  // The "last delivery" summary is just the newest row of the activity log.
  const last = await db
    .select()
    .from(deployHookDeliveries)
    .orderBy(desc(deployHookDeliveries.firedAt))
    .limit(1)
    .get();
  const configured = config.url !== "";
  const hasAuthHeader = Boolean(config.authHeaderName && config.authHeaderValue);
  return {
    enabled: config.enabled,
    configured,
    urlPreview: configured ? maskUrl(config.url) : "",
    hasAuthHeader,
    authHeaderName: hasAuthHeader ? (config.authHeaderName ?? null) : null,
    lastFiredAt: last?.firedAt ?? null,
    lastOk: last ? last.ok : null,
    lastStatus: last?.status ?? null,
    lastError: last?.error ?? null,
  };
}
