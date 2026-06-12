// Augments the wrangler-generated Env with secrets (not present in wrangler.jsonc
// vars). Set via `wrangler secret put BETTER_AUTH_SECRET` or the deploy-button
// prompt; when unset the worker falls back to a value stored in the settings table.
interface Env {
  BETTER_AUTH_SECRET?: string;
}
