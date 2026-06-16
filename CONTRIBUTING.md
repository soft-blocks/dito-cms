# Contributing to Dito CMS

Thanks for your interest in improving Dito CMS — a self-hosted, open-source headless
CMS that runs entirely on Cloudflare Workers. Contributions of all kinds are welcome:
bug reports, feature ideas, documentation, and code.

## Ways to contribute

- **Report a bug** — open an issue with steps to reproduce, what you expected, and what
  actually happened. Include your environment (local vs. deployed, Cloudflare plan,
  browser).
- **Suggest a feature** — open an issue describing the use case *before* sending a large
  PR, so we can agree on direction first.
- **Improve the docs** — fixes to the README or inline docs are always appreciated.
- **Send a pull request** — see the workflow below.

## Reporting security issues

**Please do not open public issues for security vulnerabilities.** Dito handles
authentication, API keys, and a publicly reachable MCP endpoint, so responsible
disclosure matters. Use GitHub's **Security → "Report a vulnerability"** (private
advisories) to report privately.

## Development setup

Dito uses [Bun](https://bun.sh) and the Cloudflare Workers toolchain (Wrangler).

```bash
bun install
bun run db:migrate:local   # create local D1 tables
bun run dev                # SPA + Worker together in workerd, with real local D1/R2
```

Open the printed URL (e.g. http://localhost:5173) and complete the first-run **/setup**
screen to create an admin account. See the [README](README.md#local-development) for more.

Useful scripts:

| Script | What it does |
|---|---|
| `bun run dev` | Run the SPA + Worker locally in workerd |
| `bun run build` | Production build (client + worker bundles) |
| `bun run typecheck` | `tsc` across the app, worker, and node configs |
| `bun run lint` / `bun run lint:fix` | ESLint (check / autofix) |
| `bun run db:generate` | Regenerate D1 migrations from the Drizzle schema |
| `bun run db:migrate:local` | Apply migrations to local D1 |
| `bun run seed` | Seed a demo content model (needs `DITO_API_KEY`) |

## Project conventions

- **TypeScript everywhere.** Keep the build green — `bun run typecheck` covers three
  tsconfigs (app / worker / node).
- **Lint before you push.** Run `bun run lint` (or `lint:fix`). PRs should not introduce
  new lint errors.
- **Internationalization is required.** All user-facing UI strings must go through the
  i18n helper, not hardcoded text. Use the `useI18n()` hook from `@/app/i18n`:

  ```tsx
  import { useI18n } from "@/app/i18n";

  const { t } = useI18n();
  return <button>{t("common.save")}</button>;
  ```

  Add the corresponding keys under `src/app/i18n/translations/` for **both** locales —
  Spanish (the default) and English.
- **Database changes go through migrations.** If you change the Drizzle schema, generate a
  migration with `bun run db:generate` and commit the generated SQL in `migrations/`.
  Never edit an already-applied migration by hand.
- **Match the surrounding code.** Follow the existing patterns, naming, and file
  organization rather than introducing new ones.

## Pull request workflow

1. Fork the repo and create a branch off `main`.
2. Make your change, keeping it focused — one logical change per PR is far easier to review.
3. Run the checks below.
4. Open a PR describing the **why**, not just the **what**, and link any related issue.

Before opening a PR, please make sure:

- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run build` succeeds
- [ ] New UI strings go through `t()` and exist in both locales
- [ ] Schema changes include a generated migration

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE) that covers this project.
