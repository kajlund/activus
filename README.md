# Activus

Initial TypeScript foundation for the Activus training journal. Design and architecture are defined in `.doc/visual-design.md` and `.doc/technical-architecture.md`.

## Setup

Use Node.js 22.13+ (22.x), 24+, or a newer supported even release and pnpm 10.34.5. Dependencies are pinned exactly and recorded in `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

If pnpm is unavailable, prefix commands with `npx --yes pnpm@10.34.5` instead of `pnpm`; no global installation is necessary.

Optionally copy `.env.example` to `.env` at the repository root. Defaults work without an environment file or database. Existing process environment variables take precedence. Never commit credentials. `DATABASE_URL`, if supplied, must be a PostgreSQL URL; `WEB_ORIGIN` must be an HTTP(S) origin without a path or trailing slash.

Open <http://localhost:5173>. Vite proxies `/api` to the API on port 3000 (or `PORT` from the root environment). The API exposes `GET /api/health`, returning `{"status":"ok"}`. This is process health, not database readiness. `WEB_ORIGIN` controls API CORS; Vite uses a fixed port with strict port checking.

`pnpm dev` builds contracts first, then watches contracts, API, and web together. Ctrl+C stops the process group; an exited child stops its siblings. The API handles SIGINT/SIGTERM and allows up to five seconds for in-flight requests before closing remaining connections.

## Commands

| Command                            | Purpose                                          |
| ---------------------------------- | ------------------------------------------------ |
| `pnpm dev`                         | Start all development watchers                   |
| `pnpm build`                       | Build contracts, Node API, and static web assets |
| `pnpm typecheck`                   | Check all source, tests, and Vite configuration  |
| `pnpm test`                        | Run API and client Vitest tests                  |
| `pnpm lint`                        | Run ESLint with zero warnings allowed            |
| `pnpm format`                      | Format project files                             |
| `pnpm format:check`                | Check formatting                                 |
| `pnpm --filter @activus/api start` | Run the compiled API after building              |

API tests call the Hono app directly without listening on a TCP port. Client tests use jsdom. Manrope is bundled from a local dependency, with system fallbacks and no font CDN requests.

## Structure and boundaries

```text
apps/api/src/
  config/env.ts       Zod environment validation
  app.ts              Hono construction, health, logging, errors
  server.ts           Environment loading, startup, shutdown
apps/api/test/        Direct app and environment tests
apps/web/
  public/icons/       Approved pulse-shield SVG
  src/app-shell.ts    Responsive navigation and placeholder content
  src/styles/        Approved tokens and local font foundation
  test/              Shell navigation and keyboard focus tests
packages/contracts/  HealthResponse schema/type and ESM exports
scripts/import/      Reserved for the future JSON importer
drizzle/             Reserved for future migrations
```

Build output lives in each package's `dist/`. Contracts export compiled JavaScript and TypeScript declarations; they contain only environment-independent transport schemas. API logs use generated request IDs and omit request bodies, query strings, credentials, and arbitrary exception messages. Error responses use stable codes and request IDs; internal details remain private in every environment.

The web shell follows the six approved navigation labels. Destinations currently render placeholder content only. A mobile navigation disclosure uses native keyboard behavior. Both themes follow `prefers-color-scheme`; motion respects `prefers-reduced-motion`.

Activities, goals, reporting, record-activity actions, database integration and tables, authentication, deployment, Docker, chart selection, and legacy import are intentionally deferred. No Git repository or Git configuration is initialized or changed.
