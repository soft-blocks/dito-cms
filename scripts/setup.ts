/**
 * One-shot provisioning for self-hosters with the Wrangler CLI.
 *
 *   bun run setup
 *
 * Creates the D1 database and R2 bucket on your Cloudflare account, rewrites the real
 * ids into wrangler.jsonc, applies migrations remotely, and (optionally) deploys.
 * Idempotent: re-running reuses existing resources. Requires `wrangler login` first.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ROOT = resolve(import.meta.dirname, "..");
const WRANGLER_PATH = resolve(ROOT, "wrangler.jsonc");
const PLACEHOLDER_DB_ID = "00000000-0000-0000-0000-000000000000";

function wrangler(args: string[], capture = false): string {
  return execFileSync("npx", ["wrangler", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
  });
}

function readConfigValue(key: string, fallback: string): string {
  const text = readFileSync(WRANGLER_PATH, "utf8");
  const match = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`).exec(text);
  return match?.[1] ?? fallback;
}

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.warn("→ Checking Wrangler authentication…");
    wrangler(["whoami"]);

    const dbName = readConfigValue("database_name", "dito-cms-db");
    const bucketName = readConfigValue("bucket_name", "dito-cms-media");

    // --- D1 ---
    console.warn(`\n→ Ensuring D1 database "${dbName}"…`);
    let databaseId = "";
    try {
      const list = JSON.parse(wrangler(["d1", "list", "--json"], true)) as { name: string; uuid: string }[];
      databaseId = list.find((d) => d.name === dbName)?.uuid ?? "";
    } catch {
      /* no databases yet */
    }
    if (!databaseId) {
      const created = wrangler(["d1", "create", dbName], true);
      databaseId = /"?database_id"?\s*[:=]\s*"?([0-9a-f-]{36})/i.exec(created)?.[1] ?? "";
      if (!databaseId) {
        databaseId = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(created)?.[1] ?? "";
      }
    }
    if (!databaseId) throw new Error("Could not determine the D1 database id from Wrangler output.");
    console.warn(`  database_id: ${databaseId}`);

    // --- patch wrangler.jsonc ---
    const config = readFileSync(WRANGLER_PATH, "utf8");
    if (config.includes(PLACEHOLDER_DB_ID)) {
      writeFileSync(WRANGLER_PATH, config.replace(PLACEHOLDER_DB_ID, databaseId));
      console.warn("  patched wrangler.jsonc with the real database_id");
    }

    // --- R2 ---
    console.warn(`\n→ Ensuring R2 bucket "${bucketName}"…`);
    try {
      wrangler(["r2", "bucket", "create", bucketName]);
    } catch {
      console.warn("  bucket already exists — continuing");
    }

    // --- migrations ---
    console.warn("\n→ Applying migrations to the remote D1…");
    wrangler(["d1", "migrations", "apply", "DB", "--remote"]);

    // --- deploy ---
    const answer = (await rl.question("\nBuild and deploy now? [y/N] ")).trim().toLowerCase();
    if (answer === "y" || answer === "yes") {
      console.warn("\n→ Building and deploying…");
      execFileSync("npx", ["vite", "build"], { cwd: ROOT, stdio: "inherit" });
      wrangler(["deploy"]);
      console.warn("\n✓ Deployed. Open the workers.dev URL above and complete first-run setup.");
    } else {
      console.warn("\n✓ Provisioned. Run `bun run deploy` when you're ready to ship.");
    }
  } finally {
    rl.close();
  }
}

main().catch((error: unknown) => {
  console.error("\n✗ Setup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
