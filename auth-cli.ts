// Static Better Auth config used ONLY by `@better-auth/cli generate` to emit the
// Drizzle schema (src/worker/db/auth-schema.ts). The runtime auth is a per-request
// factory in src/worker/auth.ts; the CLI cannot call a factory, so this mirrors the
// same adapter (sqlite) + plugins (admin, apiKey) so the generated tables match.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { apiKey } from "@better-auth/api-key";

export const auth = betterAuth({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: drizzleAdapter({} as any, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  plugins: [admin(), apiKey()],
});
