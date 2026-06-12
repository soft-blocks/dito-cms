import { defineConfig } from "drizzle-kit";

// SQLite dialect for Cloudflare D1. drizzle-kit only generates SQL here;
// `wrangler d1 migrations apply` is what actually runs them against D1.
export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/worker/db/schema.ts", "./src/worker/db/auth-schema.ts"],
  out: "./migrations",
});
