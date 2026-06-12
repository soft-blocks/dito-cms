import { eq } from "drizzle-orm";

import type { DrizzleDb } from "../db/client";
import { settings } from "../db/schema";

export async function getSetting(db: DrizzleDb, key: string): Promise<string | undefined> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value;
}

export async function setSetting(db: DrizzleDb, key: string, value: string): Promise<void> {
  const now = Date.now();
  await db
    .insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
}

function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Resolve the Better Auth secret. Env always wins (set via `wrangler secret` or the
 * deploy-button prompt). Otherwise auto-generate once into settings.auth_secret with a
 * race-safe INSERT-OR-IGNORE so button deployers need zero configuration.
 */
export async function getOrCreateAuthSecret(db: DrizzleDb, env: Env): Promise<string> {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  const existing = await getSetting(db, "auth_secret");
  if (existing) return existing;
  const secret = generateSecret();
  await db
    .insert(settings)
    .values({ key: "auth_secret", value: secret, updatedAt: Date.now() })
    .onConflictDoNothing();
  // Re-read in case a concurrent request won the INSERT race.
  return (await getSetting(db, "auth_secret")) ?? secret;
}
