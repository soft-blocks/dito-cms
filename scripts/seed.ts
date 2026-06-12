/**
 * Seed a demo landing-page content model + sample content.
 *
 *   DITO_API_KEY=dito_xxx bun run seed
 *   DITO_API_KEY=dito_xxx DITO_URL=https://your-worker.workers.dev bun run seed
 *
 * Builds a `hero` singleton, a `features` collection and a `testimonials` collection, then
 * authors and publishes a few entries — enough to exercise a consuming site against the
 * delivery API. Talks only to the public admin REST API with a Bearer key, so it works
 * against a local dev server or a deployed instance. Re-running is safe: collections that
 * already exist are left untouched (their entries are not duplicated).
 *
 * Create the API key in the admin under Settings → API keys.
 */
const BASE = (process.env.DITO_URL ?? "http://localhost:5173").replace(/\/$/, "");
const KEY = process.env.DITO_API_KEY ?? "";

interface ApiResult {
  status: number;
  json: unknown;
}

async function call(method: string, path: string, body?: unknown): Promise<ApiResult> {
  const headers: Record<string, string> = { Authorization: `Bearer ${KEY}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function fail(message: string, result?: ApiResult): never {
  if (result) {
    const err = (result.json as { error?: { message?: string } })?.error?.message;
    console.error(`✗ ${message} — HTTP ${result.status}${err ? `: ${err}` : ""}`);
  } else {
    console.error(`✗ ${message}`);
  }
  process.exit(1);
}

interface FieldDef {
  name: string;
  label: string;
  type: string;
  options?: Record<string, unknown>;
}

/** Create a collection. Returns true when newly created, false when it already existed. */
async function ensureCollection(def: {
  slug: string;
  name: string;
  type: "collection" | "singleton";
  description?: string;
  titleField?: string;
  fields: FieldDef[];
}): Promise<boolean> {
  const res = await call("POST", "/api/admin/collections", {
    slug: def.slug,
    name: def.name,
    type: def.type,
    description: def.description,
    fields: def.fields,
  });
  if (res.status === 409) {
    console.warn(`• ${def.slug} already exists — skipping`);
    return false;
  }
  if (res.status !== 201) fail(`Could not create ${def.slug}`, res);
  if (def.titleField) {
    const patch = await call("PATCH", `/api/admin/collections/${def.slug}`, { titleField: def.titleField });
    if (patch.status !== 200) fail(`Could not set title field on ${def.slug}`, patch);
  }
  console.warn(`✓ created ${def.type} "${def.slug}"`);
  return true;
}

async function createEntry(slug: string, data: Record<string, unknown>): Promise<void> {
  const res = await call("POST", `/api/admin/collections/${slug}/entries`, { data, publish: true });
  if (res.status !== 201) fail(`Could not create + publish an entry in ${slug}`, res);
}

async function main(): Promise<void> {
  if (!KEY) {
    console.error("✗ DITO_API_KEY is required. Create one under Settings → API keys.");
    process.exit(1);
  }

  console.warn(`→ Seeding ${BASE}\n`);

  const ping = await call("GET", "/api/admin/me");
  if (ping.status !== 200) fail("API key did not authenticate", ping);

  // --- hero (singleton) ---
  if (
    await ensureCollection({
      slug: "hero",
      name: "Hero",
      type: "singleton",
      description: "The top section of the landing page.",
      fields: [
        { name: "headline", label: "Headline", type: "text", options: { required: true, maxLength: 80 } },
        { name: "subheadline", label: "Subheadline", type: "text", options: { multiline: true } },
        { name: "cta", label: "Call to action", type: "link" },
      ],
    })
  ) {
    await createEntry("hero", {
      headline: "Ship content at the speed of thought",
      subheadline: "Dito is a tiny, self-hosted headless CMS for landing pages — running entirely on your own Cloudflare account.",
      cta: { url: "/get-started", label: "Get started", newTab: false },
    });
    console.warn("  published the hero");
  }

  // --- features (collection) ---
  if (
    await ensureCollection({
      slug: "features",
      name: "Features",
      type: "collection",
      titleField: "name",
      fields: [
        { name: "name", label: "Name", type: "text", options: { required: true } },
        { name: "description", label: "Description", type: "rich_text", options: { required: true } },
        { name: "icon", label: "Icon", type: "text" },
      ],
    })
  ) {
    const features = [
      { name: "Edge-native", icon: "zap", description: "Runs on Cloudflare Workers, D1 and R2. One Worker, one deploy, no servers to babysit." },
      { name: "Draft → publish", icon: "git-branch", description: "Author safely as a draft; publish when you're ready. The delivery API only ever serves published content." },
      { name: "AI-ready", icon: "sparkles", description: "An MCP server lets Claude model your content and fill it in — including pulling in images from a URL." },
    ];
    for (const f of features) await createEntry("features", f);
    console.warn(`  published ${features.length} features`);
  }

  // --- testimonials (collection) ---
  if (
    await ensureCollection({
      slug: "testimonials",
      name: "Testimonials",
      type: "collection",
      titleField: "author",
      fields: [
        { name: "quote", label: "Quote", type: "rich_text", options: { required: true } },
        { name: "author", label: "Author", type: "text", options: { required: true } },
        { name: "role", label: "Role", type: "text" },
      ],
    })
  ) {
    const testimonials = [
      { author: "Dana Lee", role: "CTO, Northwind", quote: "We replaced our bloated CMS in an afternoon. Our marketing site has never been faster." },
      { author: "Sam Ortiz", role: "Engineer, Acme", quote: "The delivery API is so simple our Astro site just fetches JSON and renders. That's the whole integration." },
    ];
    for (const t of testimonials) await createEntry("testimonials", t);
    console.warn(`  published ${testimonials.length} testimonials`);
  }

  console.warn(`\n✓ Done. Try the delivery API:`);
  console.warn(`    curl ${BASE}/api/v1/content/hero`);
  console.warn(`    curl ${BASE}/api/v1/content/features`);
  console.warn(`    curl ${BASE}/api/v1/content/testimonials`);
}

main().catch((error: unknown) => {
  console.error("\n✗ Seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
