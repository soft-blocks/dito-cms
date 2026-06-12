import { createMiddleware } from "hono/factory";

import { type AppEnv, getAuth } from "../lib/app";
import { forbidden, unauthorized } from "../lib/errors";

/**
 * Gate for /api/admin/* and /mcp. Resolves either a Better Auth session cookie or a
 * `Authorization: Bearer dito_…` API key. On success sets authUserId / authVia.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const auth = await getAuth(c);

  const authorization = c.req.header("Authorization");
  if (authorization?.startsWith("Bearer ")) {
    const key = authorization.slice("Bearer ".length).trim();
    const result = await auth.api.verifyApiKey({ body: { key } });
    if (!result.valid || !result.key) {
      throw unauthorized("Invalid or revoked API key");
    }
    c.set("authUserId", result.key.referenceId);
    c.set("authVia", "apikey");
    return next();
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    throw unauthorized();
  }
  if (session.user.banned) {
    throw forbidden("This account has been deactivated");
  }
  c.set("authUserId", session.user.id);
  c.set("authVia", "session");
  return next();
});
