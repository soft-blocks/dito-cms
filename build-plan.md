# Dito CMS — Implementation Plan

## Context

Build a simple, open-source headless CMS for corporate landing pages, self-hosted on the user's own Cloudflare account. It handles only structured data, images, and videos. Editors define their own data model in a builder UI (field types: text, rich text, number, boolean, picture, video, link), author content with a draft→publish workflow, and consuming sites (e.g. the Astro template in this repo) read published content from a public delivery API. An MCP server lets Claude or any AI set up the data model and manage content.

**Location:** `/Users/larpa/Documents/SoftBlocks/SoftBlocks/projects/dito/headlessCMS` (currently empty — greenfield). Self-contained project (own package.json), designed to be extracted into its own repo for OSS release. Working name: **Dito CMS** (trivial to rename).

**Decisions locked with the user:**
- Public read delivery API (published content, no auth, CORS open). Admin/write APIs authenticated.
- Draft → publish per entry; delivery serves published data only.
- Invite-only users, no roles: first-run setup creates the initial admin; any user can create more users; open signup disabled; all users equal.
- No localization in v1 (storage shaped so it can be added later — see `entries.locale`).

**House conventions** (from the sibling `Hono/` template): Bun, Hono, Drizzle, wrangler.jsonc, Tailwind v4, ESLint flat config.

---

## Architecture

**One Worker, one package, one deploy.** A single Cloudflare Worker serves everything. Built as a single Vite project with `@cloudflare/vite-plugin`: `bun run dev` runs SPA + Worker together in workerd with real local D1/R2 bindings; deploy is `vite build && wrangler deploy`. No monorepo/workspaces — the shared validation module is just a folder both sides import, and the Deploy-to-Cloudflare button works against exactly one Worker.

| Route | What | Auth |
|---|---|---|
| `/` + all unmatched | Admin SPA (Workers Static Assets, `not_found_handling: "single-page-application"`) | — |
| `/api/auth/*` | Better Auth handler | public by design |
| `/api/setup/status`, `/api/health` | first-run check, health | public |
| `/api/admin/*` | Admin API (collections, fields, entries, media mgmt) | session cookie **or** Bearer API key |
| `/api/v1/*` | Delivery API (published content, public schema) | public, CORS `*` (GET/HEAD/OPTIONS) |
| `/media/:id/:filename` | Media serving from R2 (Range, ETag, immutable cache) | public |
| `/mcp` | MCP server (streamable HTTP, stateless) | Bearer API key |

`wrangler.jsonc` essentials: `main: src/worker/index.ts`, `compatibility_flags: ["nodejs_compat"]`, assets with `run_worker_first: ["/api/*", "/media/*", "/mcp"]`, D1 binding `DB` (+ `migrations_dir: "migrations"`), R2 binding `MEDIA`, `observability.enabled`.

### Tech stack (pin on install; verified compatible June 2026)

| Concern | Choice |
|---|---|
| Build / host | Vite 8 + `@cloudflare/vite-plugin`, wrangler 4 |
| Worker framework | Hono 4 |
| DB / migrations | Drizzle ORM 0.45.x + drizzle-kit (`dialect: "sqlite"`), `wrangler d1 migrations apply` |
| Auth | better-auth 1.6.x — email+password, **admin** + **apiKey** plugins, drizzle adapter (`better-auth/adapters/drizzle`), `better-auth/react` client |
| Validation | zod 4 (shared module, both sides) |
| SPA | React 19, TanStack Router (code-based route tree, no codegen), TanStack Query 5, react-hook-form + `@hookform/resolvers`, sonner, dnd-kit, lucide-react |
| UI | shadcn/ui + Tailwind v4 (`@tailwindcss/vite`), `@tailwindcss/typography` |
| Rich text | TipTap 3 (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`) + `@tiptap/html` for server-side HTML |
| MCP | `@modelcontextprotocol/sdk` + `@hono/mcp` (StreamableHTTPTransport, stateless — **no** Durable Objects / `McpAgent`) |
| IDs | nanoid |

---

## Data model (D1)

No dynamic DDL ever. The user's data model is metadata (`collections` + `fields`); entry content is JSON in `entries`. Timestamps = INTEGER epoch ms; IDs = nanoid TEXT.

**Better Auth tables** — generated via `bunx @better-auth/cli generate` into `src/worker/db/auth-schema.ts` (committed): `user` (+ admin-plugin columns role/banned/…), `session`, `account` (scrypt password hash), `verification`, `apikey` (hashed key, `start` prefix for display, enable/expiry columns).

**`collections`**: `id` PK · `slug` UNIQUE (`^[a-z][a-z0-9-]*$`, reserved words blocked) · `name` · `description` · `type` CHECK `('collection','singleton')` · `title_field` (field name used as list title; nullable) · `content_version` INTEGER (bumped on publish/unpublish/delete → cheap list ETags) · `sort_order` REAL · timestamps. **slug and type immutable after create** (rename breaks consumers + needs JSON rewrites).

**`fields`**: `id` PK · `collection_id` FK CASCADE · `name` (API key, camelCase `^[a-zA-Z][a-zA-Z0-9_]*$`, immutable after create) · `label` · `type` CHECK in 7 types · `options` JSON TEXT (per-type, validated server-side on field save) · `sort_order` REAL · timestamps. UNIQUE`(collection_id, name)`, index `(collection_id, sort_order)`.

**`entries`**: `id` PK · `collection_id` FK CASCADE · `slug` (optional) · `locale` TEXT DEFAULT `''` (reserved for future i18n) · `draft_data` JSON TEXT · `published_data` JSON TEXT NULL · `published_etag` (hash computed at publish) · `sort_order` REAL (append = max+1024; reorder = rewrite index×1024) · `draft_updated_at` · `published_at` · timestamps · `created_by`/`updated_by` FK→user SET NULL.
Indexes: partial UNIQUE`(collection_id, locale, slug) WHERE slug IS NOT NULL`; `(collection_id, sort_order)`; partial `(collection_id, sort_order) WHERE published_data IS NOT NULL`.
**Status is derived, never stored**: `published_data IS NULL` → draft; `draft_updated_at > published_at` → published+changes; else published.

**`media`**: `id` PK · `kind` CHECK `('image','video')` · `filename` (sanitized) · `r2_key` UNIQUE (`media/<id>/<filename>`) · `mime` (allowlist per kind) · `size` · `width`/`height` (images, client-captured) · `duration` (videos, client-captured) · `alt` · `status` CHECK `('uploading','ready')` · `upload_id` (R2 multipart id while uploading) · `created_at`/`created_by`.

**`settings`**: `key` PK · `value` · `updated_at`. v1 use: auto-generated `auth_secret` fallback (see Auth).

---

## Field types

Single source of truth `src/shared/field-types.ts`: per type — an options zod schema, a value-schema factory `(options) => ZodType`, default resolver. Two generated entry schemas (`src/shared/validation.ts`):
- `buildDraftSchema(fields)` — lenient: types/format checked, everything optional (drafts save half-finished).
- `buildPublishSchema(fields)` — full: `required`, bounds enforced. **Required is enforced at publish, not draft-save.**
Unknown keys stripped on write; delivery serializes only currently-defined fields → schema changes never corrupt old rows (removed fields ignored; added fields emitted as `default ?? null` so consumers get a stable shape).

Common options: `required` (hidden for boolean), `help`. Per type:

| Type | Storage | Options |
|---|---|---|
| `text` | `string` | `multiline`, `default`, `placeholder`, `minLength`/`maxLength` |
| `rich_text` | `{ json: TipTapDoc, html: string }` — **HTML always regenerated server-side** from JSON via `@tiptap/html` against a fixed allowlist (paragraph, h2–h4, bold, italic, lists, blockquote, hr, hard break, link with protocol allowlist http/https/mailto/tel/relative). Client HTML never trusted → no stored XSS. ≤256 KB | `placeholder` |
| `number` | `number` | `integer`, `min`/`max`, `default`, `placeholder` |
| `boolean` | `boolean` (always present) | `default` (false) |
| `picture` | `string` media id — server checks exists + `kind='image'` + `ready` (batched IN query) | — |
| `video` | same, `kind='video'` | — |
| `link` | `{ url, label?, newTab? }` | `allowRelative` (default true — `/pricing`, `#contact`) |

Alt text lives on the media row (fix once, applies everywhere).

---

## HTTP API surface

Error envelope everywhere: `{ error: { code, message, fieldErrors? } }`. `fieldErrors` keyed by field name → SPA maps into react-hook-form `setError`.

**Auth (`/api/auth/*`, Better Auth):** sign-up (only honored while `user` table is empty — dynamic `disableSignUp`), sign-in, sign-out, get-session, change-password; admin plugin: create-user / list-users / set-user-password / ban (=deactivate) / remove-user; apiKey plugin: create / list / delete. SPA uses `better-auth/react` + `adminClient()` + `apiKeyClient()` so paths never appear in our code.

**Admin (`/api/admin/*`, session or Bearer key — one `requireAuth` middleware resolves both):**
- Collections: `GET /collections` (with entry counts) · `POST /collections` `{slug,name,type,description?,fields?}` (singleton ⇒ auto-create its entry) · `GET /collections/:slug` (+ ordered fields) · `PATCH /collections/:slug` (name/description/title_field/sort_order only) · `PUT /collections/:slug/fields` `{fields[], allowDestructive?}` — **declarative full-state**; server diffs by field name, rejects removals/type-changes unless flagged, returns `{added,updated,removed}` · `DELETE /collections/:slug?confirm=<slug>`.
- Entries: `GET /collections/:slug/entries?status&limit&offset&search` (search = LIKE over draft_data; returns derived status + title preview) · `POST /collections/:slug/entries` `{data,slug?,publish?}` · `GET /entries/:id` (draft+published+status) · `PATCH /entries/:id` `{data?,slug?,sort_order?}` (draft-schema validated, merged into draft) · `POST /entries/:id/publish` (publish-schema validation → copy draft→published, set `published_at`/`published_etag`, bump `content_version`, single `db.batch`) · `POST /entries/:id/unpublish` · `DELETE /entries/:id` · `POST /collections/:slug/entries/reorder` `{ids[]}`.
- Media: `GET /media?kind&search&limit&offset` · `POST /media?filename&alt&width&height` — direct **image** upload, raw streamed body → `bucket.put(key, c.req.raw.body)`, cap 25 MB, mime allowlist (careful with SVG: serve with `X-Content-Type-Options`/`Content-Disposition`) · multipart for **video**: `POST /media/multipart` `{filename,mime,size}` → `{mediaId,uploadId,partSize:10485760}`; `PUT /media/multipart/:mediaId/parts/:n?uploadId=` (raw chunk → `uploadPart`, enforce equal part size except final); `POST /media/multipart/:mediaId/complete` `{uploadId,parts[],width?,height?,duration?}`; `DELETE /media/multipart/:mediaId?uploadId=` (abort) · `GET /media/:id/usage` (LIKE scan over entries → referencing entry titles) · `PATCH /media/:id` `{alt?,filename?}` · `DELETE /media/:id` (warn-don't-block; delivery emits `null` for dangling refs).

**Delivery (`/api/v1/*`, public, CORS `*`):**
- `GET /api/v1/collections` — public schema (collections + field defs) for typed clients.
- `GET /api/v1/content/:slug` — collection type: `?limit(≤100)&offset&sort&filter[field][op]=value` (ops eq/ne/lt/lte/gt/gte/contains, compiled to `json_extract(published_data,'$.field')`, field names validated against `fields`, values bound as params). Singleton type: returns the single object directly. Response `{data:[{id,slug,sortOrder,publishedAt,data}], meta:{total,limit,offset}}` with media refs expanded.
- `GET /api/v1/content/:slug/:idOrSlug` — single published entry (404 if not published).
- Caching: entries `ETag: W/"<published_etag>"`, lists `ETag: W/"<slug>-<content_version>"`, honor `If-None-Match` → 304; `Cache-Control: public, max-age=60, stale-while-revalidate=300`.
- Media expansion: collect ids across response, one chunked `IN` query (≤90 ids — D1's 100-param limit), expand to `{id, url, mime, width, height, duration, alt, size}` with **absolute URL derived from request origin** → works on any domain.

**Media serving `GET /media/:id/:filename`:** R2 get straight by key (no D1 read; content-type stored as R2 `httpMetadata` at upload). Range support (single range → 206 + `Content-Range`, `Accept-Ranges: bytes` — required for video seeking), `If-None-Match` via R2 `onlyIf` → 304, `ETag: object.httpEtag`, `Cache-Control: public, max-age=31536000, immutable` (URLs unique per media id). Opportunistic `caches.default` for non-Range image GETs only (Cache API is a no-op on workers.dev — never depend on it).

---

## Auth design (Better Auth on Workers + D1)

- **Per-request factory** `createAuth(db, env, origin)` (bindings are request-scoped): `baseURL` = request origin, `trustedOrigins: [origin]` → any domain works zero-config; `useSecureCookies` only on https (Vite dev is http).
- **Secret:** `env.BETTER_AUTH_SECRET` if set (via `wrangler secret` / deploy-button prompt from `.dev.vars.example`); else auto-generate once into `settings.auth_secret` (`crypto.getRandomValues`, INSERT-OR-IGNORE race-safe). Zero-config for button deployers; env always wins.
- **First-run:** `emailAndPassword.disableSignUp` computed per request from `SELECT count(*) FROM user` (memoize once true). Setup page is just Better Auth signup; afterwards signup returns 403.
- **Invite-only, no roles:** every user is created with admin-plugin `createUser` and `role:'admin'` (the "no roles" requirement = everyone-is-admin so plugin gates always pass; roles never surface in UI). No invite emails in v1 (no email provider dependency): creating admin sets a temp password (generated client-side, shown once with copy), user changes it after login. Guards: can't deactivate/delete self, can't remove last active user (UI-disabled + server-enforced).
- **API keys:** Better Auth apiKey plugin (hashed at rest, `start` prefix for display, show-once on create). Used for: Bearer auth on `/api/admin/*` and `/mcp`.

---

## MCP server

**Stateless streamable HTTP** at `POST /mcp` (GET/DELETE → 405). Per request: validate Bearer key (401 JSON otherwise) → `new McpServer()` + `@hono/mcp` `StreamableHTTPTransport` → register tools bound to this request's Drizzle client → handle. No Durable Objects, no sessions — tools-only server. Rejected `agents`/`McpAgent`: needs DO migrations + stateful sessions we don't use; complicates the deploy button.

Tools are thin wrappers over the same `services/` + shared validation the admin API uses. **16 tools:** `get_cms_info` (base URL, counts, field-type cheat-sheet, delivery URL patterns — AI cold-start), `list_collections`, `get_collection`, `create_collection` (one-shot with fields[]), `update_collection`, `set_collection_fields` (declarative, `allowDestructive` guard, returns diff), `delete_collection` (confirm=slug), `list_entries`, `get_entry`, `create_entry` (`publish?` flag; rich_text accepts TipTap JSON or plain text — server wraps paragraphs), `update_entry`, `publish_entry`, `unpublish_entry`, `delete_entry`, `list_media`, `upload_media_from_url` (Worker fetches URL into R2 with size/mime guards — lets AI populate imagery). Tool descriptions embed the field-type reference; list results stay compact (paginate).

Client connection (document in README):
- Claude Code: `claude mcp add --transport http dito https://<domain>/mcp --header "Authorization: Bearer dito_xxx"`.
- Claude Desktop (no custom headers in connector UI): `npx mcp-remote https://<domain>/mcp --header "Authorization: Bearer dito_xxx"`.

---

## Admin SPA design

**Conventions:** TanStack Query owns server state (key factories per resource in `src/app/api/*`); no global state lib; forms = RHF + zod (shared schemas); skeletons shaped like final layout (never full-page spinners); mutation errors → sonner toast + `fieldErrors` mapped inline; 401 on query → redirect to login; **401 on mutation → toast with sign-in action (never redirect — don't destroy a long form)**; unsaved-changes guard (router blocker + beforeunload) on entry editor and field sheet. Light theme only in v1. Auth/setup guards in router `beforeLoad`; data fetching in components, not loaders.

**Routes:** `/setup` (first-run, only when no users) · `/login` · `/` → `/collections` · `/collections` (dashboard = list, grouped Collections/Singletons, entry counts, New-collection dialog) · `/collections/$slug` (collection → entries table; singleton → editor directly) · `/collections/$slug/schema` (builder) · `/collections/$slug/entries/new` + `/collections/$slug/entries/$id` (editor) · `/media` · `/settings/{general,users,api-keys}` · 404. Layout: sidebar (nav groups built from collections query, Media, Settings, user menu w/ change-password + sign-out).

**Schema builder:** create-collection dialog (name → auto-slug, editable until create, then locked w/ tooltip; type radio cards collection/singleton; description). Builder page: ordered field rows (drag handle, label, mono name, type icon, required badge, edit/delete) + dashed "Add field". Field add/edit in a Sheet: step 1 type-picker grid (7 tiles), step 2 options form (zod-validated; name auto-camelCased from label, locked after create; per-type options per table above). Field type immutable (delete + re-add instead). Delete field → AlertDialog warning data becomes invisible and is stripped on next entry save. Delete collection → type-the-slug confirm + entry count. Edit-details dialog includes **Title field** select (drives list titles + usage warnings). dnd-kit reorder → `PUT fields` (optimistic).

**Entry editor:** generated form via `fieldRegistry: Record<FieldType, FC>` wrapped in shadcn Form primitives (uniform label/help/required/error). Inputs: Input/Textarea, RichTextInput (TipTap card + sticky shadcn ToggleGroup toolbar: H2 H3, bold, italic, bullet/ordered list, blockquote, link popover, undo/redo; `@tailwindcss/typography` for in-editor prose), number Input, Switch, MediaInput (empty → dashed picker button; filled → thumbnail + Replace/Clear; missing media → placeholder + Clear), link composite (url + optional label + newTab). Sticky status bar: back, live title (title-field watch), status badge (Draft gray / Published green / Published·pending amber), "Saved Xm ago"/"Unsaved changes", **Save draft** (Cmd/Ctrl+S), **Publish** (dirty ⇒ save-then-publish; publish-schema validation; on fail scroll-to-first-error + toast), overflow: Discard draft changes / Unpublish / Delete (each AlertDialog, availability per status matrix). Explicit save — no autosave in v1. Singleton: same editor, auto-bootstrap entry server-side (idempotent get-or-create), no delete.

**Entries list:** table (drag handle | title | status badge | updated | row menu), debounced server search, status filter ToggleGroup, pagination (50/page), dnd-kit manual reorder (disabled while searching or beyond page 1 — tooltip explains), delete warns when published ("live, disappears immediately").

**Media library:** responsive grid (lazy thumbnails; video tiles w/ icon + ext badge), All/Images/Videos filter, search, infinite scroll (`useInfiniteQuery` + sentinel, 40/page). Full-page drag-drop overlay + Upload button. Upload queue: floating bottom-right card, per-file progress (XHR onprogress for images; parts-done/total for videos), cancel, per-file retry (resume from last acked part), invalidate per completed file. Detail Sheet: preview (`<video controls>` for video), alt-text edit, info, Copy URL, Delete (usage list warning — warn, don't block). MediaPickerDialog (entry fields): Library tab (grid pre-filtered by kind, select-and-close) + Upload tab (auto-select on completion). Shares MediaGrid + upload hook with the library page.

**Settings:** Users (table; create dialog w/ temp password show-once; reset password; deactivate/reactivate; delete; self/last-user guards). API keys (create → show-once full key + copy + amber warning; list name/`dito_a1b2…` prefix/created/last-used; revoke w/ warning). General (project name in `settings`, read-only info card: delivery base URL, version, docs link).

---

## Project structure

```
headlessCMS/
├─ wrangler.jsonc                # bindings DB/MEDIA, assets + run_worker_first, migrations_dir
├─ vite.config.ts                # react() + tailwindcss() + cloudflare() plugins
├─ drizzle.config.ts             # dialect sqlite, schema src/worker/db, out ./migrations
├─ package.json bun.lock tsconfig.json eslint.config.js
├─ .dev.vars.example             # BETTER_AUTH_SECRET (deploy-button prompts from this)
├─ index.html                    # → src/app/main.tsx
├─ migrations/                   # drizzle-kit output, committed
├─ scripts/setup.ts              # CLI: create D1+R2, patch wrangler ids, migrate, secret, deploy
├─ public/
└─ src/
   ├─ shared/                    # ISOMORPHIC — no React, no Hono, no worker imports
   │  ├─ field-types.ts          # 7 types: options schema, value-schema factory, defaults
   │  ├─ validation.ts           # buildDraftSchema / buildPublishSchema + static form schemas
   │  ├─ richtext.ts             # TipTap extension allowlist + doc-shape zod
   │  ├─ api-types.ts            # DTOs, ApiError envelope
   │  ├─ slug.ts                 # kebab/camel sluggers + reserved words
   │  └─ constants.ts            # PART_SIZE=10MiB, caps, mime allowlists
   ├─ worker/
   │  ├─ index.ts                # Hono app composition; JSON 404 for unmatched /api/*
   │  ├─ auth.ts                 # createAuth(db, env, origin) factory
   │  ├─ middleware/             # requireAuth (session|key), delivery CORS, error handler
   │  ├─ routes/                 # setup, admin-collections, admin-entries, admin-media, delivery, media
   │  ├─ services/               # collections, entries (validate/publish/reorder), media (R2), expand, html
   │  ├─ mcp/                    # server.ts (per-request wiring) + tools.ts (16 tools)
   │  └─ db/                     # schema.ts, auth-schema.ts (generated, committed), client.ts
   └─ app/
      ├─ main.tsx  router.tsx  styles.css
      ├─ api/                    # client.ts (fetch+envelope+401 rules) + per-resource modules w/ query keys
      ├─ components/{ui,layout,common}/   # shadcn; AppShell/Sidebar; EmptyState/ErrorState/ConfirmDialog/StatusBadge…
      ├─ features/
      │  ├─ auth/  collections/(+builder/)  entries/(+inputs/)  media/  settings/
      ├─ hooks/                  # use-debounce, use-unsaved-changes-guard
      └─ lib/                    # cn, format (bytes/relative time — Intl, no date lib)
```

Enforce import boundary (ESLint `import/no-restricted-paths`): `app`/`shared` never import from `worker`. shadcn components to add (~24): button, input, textarea, label, form, select, radio-group, switch, badge, card, table, dialog, alert-dialog, sheet, dropdown-menu, toggle, toggle-group, separator, skeleton, tooltip, alert, progress, pagination, sonner.

---

## Phases (5 iterations)

### Phase 1 — Foundation, auth, deployable skeleton
Scaffold Vite 8 + `@cloudflare/vite-plugin` + React 19 + Tailwind v4 + shadcn + Hono; `wrangler.jsonc` (D1/R2/assets/`run_worker_first`); Drizzle + migrations pipeline incl. Better Auth CLI schema; `createAuth` factory (dynamic signup gating, admin + apiKey plugins, secret fallback, origin-derived baseURL); `requireAuth` middleware (session or Bearer); error envelope + JSON 404. SPA: router with all route shells + auth/setup guards, api/client.ts, QueryClient, Toaster, AppShell + Sidebar + UserMenu (change password, sign out), LoginPage, SetupPage, 404, EmptyState/ErrorState/ConfirmDialog, Users + API-keys settings pages (Better Auth client). `scripts/setup.ts` + deploy script (`build && wrangler d1 migrations apply DB --remote && wrangler deploy`). README quickstart.
**Verify:** fresh account → `bun run setup` → deployed workers.dev URL boots to `/setup`; create admin → empty `/collections`; second signup → 403; deep-link refresh works; create second user via settings, log in as them; API key authenticates a `GET /api/admin/*` probe via Bearer; revoked key fails; **measure sign-in CPU on free plan** (scrypt risk — see Risks).

### Phase 2 — Data model builder
`collections`/`fields` tables + migrations; shared `field-types.ts`/`validation.ts`/`slug.ts` (per-type options validated — e.g. min≤max, default must satisfy the field's own value schema); routes: collections CRUD, declarative `PUT fields` with diff + `allowDestructive`, delete with confirm; singleton auto-entry on create. UI: CollectionsListPage (groups, counts, empty states), CreateCollectionDialog (auto-slug, type cards), SchemaBuilderPage (field rows, dnd-kit reorder, FieldSheet two-step add/edit with per-type options, delete warnings, edit-details w/ title-field select, delete collection type-to-confirm).
**Verify:** build a `hero` singleton + `testimonials` collection (mixed field types) in the UI; reload-safe; invalid options rejected with inline field errors; field name/type immutability visible; removing a field demands the destructive flag path.

### Phase 3 — Entries + delivery API
`entries` table + migration; entry services (draft merge, publish with publish-schema validation + etag + `content_version` bump in one `db.batch`, unpublish, reorder, derived status); server-side rich-text HTML generation (`@tiptap/html` against shared allowlist — **smoke-test in workerd early**); admin entry routes; delivery API (lists w/ filter/sort/pagination, singleton shape, get by id/slug, ETag/Cache-Control/304, CORS, stable-shape normalization `default ?? null`). UI: EntriesListPage (search, status filter, pagination, reorder, delete), EntryEditorPage + EntryForm + field registry (all inputs except media — MediaInput renders a Phase-4 placeholder), TipTap RichTextInput + toolbar, EntryStatusBar (full action matrix, Cmd+S, save-then-publish), unsaved-changes guard, singleton bootstrap, server fieldErrors → RHF.
**Verify:** author → save draft → publish → `curl` from another origin sees it (CORS); unpublished invisible; edit-after-publish shows amber "pending changes" while delivery still serves old data; discard reverts; `If-None-Match` → 304; required-only-at-publish confirmed; TipTap HTML output renders in workerd.

### Phase 4 — Media (R2 pipeline)
`media` table + migration; `GET /media/*` (Range/206, ETag/304, immutable cache, opportunistic Cache API); direct image upload (streamed, 25 MB cap, mime allowlist, client-captured dimensions); multipart video protocol (create → equal 10 MiB parts → complete; abort; server enforces part-size rule); usage endpoint; delivery media expansion (chunked IN ≤90, absolute URLs from request origin). UI: MediaLibraryPage (grid, filters, search, infinite scroll, full-page dropzone), use-upload hook + UploadQueue (progress, cancel, retry/resume), MediaDetailSheet (alt, copy URL, delete + usage list), MediaPickerDialog, real MediaInput in entry editor, missing-media placeholder.
**Verify:** upload a >100 MB video in dev and prod (proves chunking beats the body limit); `<video>` seeking issues 206s; wrong-size part rejected; image dimensions persisted; entry with picture+video publishes and delivery returns absolute URLs valid on workers.dev **and** a custom domain; deleting a referenced asset shows usage list, delivery then emits `null`.

### Phase 5 — MCP + OSS polish
`/mcp` stateless server + bearer auth + 16 tools over existing services (incl. `upload_media_from_url`); compact/paginated tool outputs. Polish: GeneralSettingsPage, skeleton/empty-state/toast audit on every page, favicon + titles. OSS: README (Deploy-to-Cloudflare button, CLI path via `scripts/setup.ts`, MCP connect for Claude Code + Desktop/mcp-remote, consuming-from-Astro fetch example, plan-limit notes), `.dev.vars.example`, MIT LICENSE, seed example (optional script creating a demo landing-page model).
**Verify:** `claude mcp add --transport http … --header` against the deployed instance → ask Claude to model a landing page (hero singleton, features, testimonials) and populate content incl. an image from URL → confirm via delivery API; revoke key → MCP 401s; full deploy-button run from a clean Cloudflare account: provisions D1/R2, applies migrations, boots to `/setup`; click-through every page: no unstyled loading, no dead ends, no console errors.

---

## Risks & gotchas (mitigations baked into the design)

1. **scrypt vs free-plan 10 ms CPU**: Better Auth password hashing may exceed free-tier CPU. Measure in Phase 1; README recommends Workers Paid for production; optional documented WebCrypto PBKDF2 `password.hash/verify` override for free tier.
2. **R2 multipart rule**: all parts except last must be equal size, ≥5 MiB → server dictates `PART_SIZE` 10 MiB and rejects violations.
3. **Workers body limit (100 MB free/pro)**: images capped 25 MB direct; videos always multipart; bodies streamed to R2, never buffered (isolate memory 128 MB).
4. **Cache API no-op on workers.dev**: treat as opportunistic only; correctness never depends on it.
5. **D1 limits**: 100 bound params (chunk IN at 90), 2 MB row (entry JSON ≤1 MB, rich text ≤256 KB), no interactive transactions (`db.batch` is the atomicity primitive), free tier 500 MB DB (README note).
6. **SPA fallback shadowing APIs**: `run_worker_first` + Hono JSON 404 on unmatched `/api/*`.
7. **Better Auth pinning**: regenerate auth schema + migration together when bumping the dep; verify exact admin/apiKey plugin option names at implementation (fallback: explicit `verifyApiKey` call in `requireAuth`).
8. **MCP client quirks**: Claude Desktop connectors can't send headers → document `mcp-remote`; keep tool results <10k tokens.
9. **Deploy button**: provisions D1/R2 + rewrites ids from wrangler.jsonc but does **not** run migrations → deploy script runs `wrangler d1 migrations apply DB --remote` first; secrets prompted from `.dev.vars.example`; settings-table secret fallback covers skips.
10. **`json_extract` filters are table scans**: fine at landing-page scale; document; SQLite expression indexes are the future escape hatch.
11. **Public media regardless of entry status** (unguessable nanoid URLs) and **last-write-wins concurrency**: accepted v1 behavior, documented in README.
12. **`@tiptap/html` in workerd**: expected fine (no DOM dependency) — smoke-test at the very start of Phase 3.

## Out of scope (v1) — noted for later
Localization (schema ready via `entries.locale`), roles/permissions, entry version history, relations between collections, image transforms (design tolerates swapping `/cdn-cgi/image` in later), webhooks, password-reset emails / email provider, dark mode, scheduled publishing.