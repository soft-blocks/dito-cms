import type { DrizzleDb } from "../db/client";
import { getSetting, setSetting } from "./settings";

import type {
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
const STATUS_KEY = "deploy_hook_status";
const TIMEOUT_MS = 10_000;

/** The secret config persisted under `deploy_hook`. Never sent to the browser as-is. */
interface DeployHookConfig {
  url: string;
  authHeaderName?: string;
  authHeaderValue?: string;
  enabled: boolean;
}

/** Last delivery result persisted under `deploy_hook_status` (safe to surface, read-only). */
interface DeployHookStatus {
  lastFiredAt: number;
  ok: boolean;
  status: number | null;
  error?: string;
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

function parseStatus(raw: string | undefined): DeployHookStatus | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DeployHookStatus>;
    if (typeof parsed.lastFiredAt !== "number") return null;
    return {
      lastFiredAt: parsed.lastFiredAt,
      ok: parsed.ok === true,
      status: typeof parsed.status === "number" ? parsed.status : null,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
    };
  } catch {
    return null;
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
 * Fire the hook for a published-content change. No-op (returns ok:false) when disabled or
 * unconfigured. POSTs with no body (Cloudflare contract) and applies the optional auth
 * header. Records the outcome to `deploy_hook_status`. NEVER throws — a delivery failure
 * must not break the mutation that triggered it.
 */
export async function triggerDeployHook(db: DrizzleDb): Promise<DeployHookTestResult> {
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

  const status: DeployHookStatus = {
    lastFiredAt: Date.now(),
    ok: result.ok,
    status: result.status,
    error: result.error,
  };
  try {
    await setSetting(db, STATUS_KEY, JSON.stringify(status));
  } catch {
    // Persisting the status is best-effort; never throw from the trigger path.
  }
  return result;
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
  const status = parseStatus(await getSetting(db, STATUS_KEY));
  const configured = config.url !== "";
  const hasAuthHeader = Boolean(config.authHeaderName && config.authHeaderValue);
  return {
    enabled: config.enabled,
    configured,
    urlPreview: configured ? maskUrl(config.url) : "",
    hasAuthHeader,
    authHeaderName: hasAuthHeader ? (config.authHeaderName ?? null) : null,
    lastFiredAt: status?.lastFiredAt ?? null,
    lastOk: status ? status.ok : null,
    lastStatus: status?.status ?? null,
    lastError: status?.error ?? null,
  };
}
