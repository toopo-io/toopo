# Toopo

Continuous, deterministic cartography of a codebase. A parser turns a repo into a
rich, queryable graph of symbols, dependencies, and usages — updated on every push,
delta-only. The graph is the foundation feature; everything else is built on it.

## Tech Stack

- **Runtime**: Node.js 22 LTS
- **Package manager**: pnpm 11
- **Monorepo**: Turborepo 2
- **Language**: TypeScript 6 (strict)
- **Linting & formatting**: Biome 2
- **Testing**: Vitest 4 with v8 coverage
- **Git hooks**: Lefthook 2
- **Commit conventions**: Commitlint 21 (Conventional Commits)
- **CI**: GitHub Actions

## Monorepo Structure

```
toopo/
├── apps/
│   ├── web/              # Next.js 16 app (app.toopo.io target)
│   └── api/              # NestJS 11 + Fastify API (api.toopo.io target)
├── packages/
│   ├── ui/               # shadcn/ui shared components (Tailwind 4)
│   ├── api-contracts/    # Shared Zod schemas — single source of truth on the wire
│   └── env/              # Shared env validator (Zod)
└── tooling/
    ├── biome/            # Biome lint/format rules
    ├── tsconfig/         # Shared TypeScript configs (base/node/nextjs/library)
    ├── vitest/           # Shared Vitest configs (base, react)
    └── tailwind/         # Shared Tailwind 4 entry + design tokens
```

## Apps

- **@toopo/web** — Next.js 16 App Router, RSC by default, Tailwind 4, TanStack Query 5,
  Zustand 5, React Hook Form 7 with Zod resolvers. Dev port 3000.
- **@toopo/api** — NestJS 11 on Fastify with swc build, nestjs-pino structured logs,
  nestjs-zod global validation + serialization, OpenAPI at `/docs`. Dev port 4000.

## Packages

- **@toopo/ui** — shadcn/ui (New York style, RSC enabled). Exports Button, Card, Input
  and the global Tailwind CSS entry. React, react-dom, tailwindcss are peer deps.
- **@toopo/api-contracts** — Pure Zod schemas shared by API (validation, OpenAPI) and
  web (forms, response parsing). Zero deps except Zod. Single source of truth.
- **@toopo/env** — Zod-based env validation helper. Apps extend a base schema and
  call `createEnvValidator(schema)(process.env)` for fail-fast boot.

- **@toopo/i18n** — Shared locale primitives: `SUPPORTED_LOCALES`,
  `DEFAULT_LOCALE`, `negotiateLocale(acceptLanguage)`,
  `resolveLocaleFromPath(pathname)`. Consumed by both web (next-intl
  routing) and API (locale interceptor).

- **@toopo/db** (Phase 4) — Drizzle ORM client + Better Auth canonical
  schema, backed by `@neondatabase/serverless`. Exposes
  `createDb({ databaseUrl })` and the named tables (`user`, `session`,
  `account`, `verification`). Migrations live outside `src/` under
  `drizzle/migrations/` (ADR-0010 category 2). See
  [packages/db/README.md](packages/db/README.md) and
  [ADR-0012](docs/adr/0012-database-choice.md).

### Internationalization

- `apps/web` uses `next-intl` 4 with messages under
  `apps/web/src/i18n/messages/<locale>.json` and locale-prefixed URLs
  (`/en/…`).
- `apps/api` uses `i18next` 26 with resources embedded at compile time
  from `apps/api/src/i18n/locales/<locale>.json`. `Accept-Language`
  flows from the frontend; errors come back translated and the reply
  carries `Content-Language`.

Adding a locale is configuration only: extend `SUPPORTED_LOCALES` in
`packages/i18n/src/locales.ts`, add matching JSON files in
`apps/web/src/i18n/messages/` and `apps/api/src/i18n/locales/`, and
rebuild. See [ADR-0009](docs/adr/0009-i18n-strategy.md) for the
rationale and constraints.

### Authentication and database (Phase 4)

`apps/api` mounts **Better Auth** at `/v1/auth/*` (raw Fastify
catch-all, see `apps/api/src/main.ts`) backed by **Neon Postgres**
through `@toopo/db`'s Drizzle adapter. The default flow is email +
password with mandatory email verification; Google OAuth is enabled
when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both set.

**Flow at a glance:**

```
[web] POST /v1/auth/sign-up/email   --->  [api] Better Auth handler
                                                |
                                                v
                                          INSERT user (emailVerified=false)
                                          enqueue verification email
                                                |
                          (RESEND_API_KEY set?)  v
                                       Yes -> Resend send
                                       No  -> Pino log (dev fallback)

[user clicks email link] -> GET /v1/auth/verify-email?token=...
                                                |
                                                v
                                       Better Auth verifies + signs in
                                       302 redirect to callbackURL (/)
```

Sessions are httpOnly cookies (`better-auth.session_token`). The web
proxy (`apps/web/src/proxy.ts`) does a cookie-existence redirect to
`/{locale}/signin?next=...` on protected routes; the real session
check happens in the page via `getServerSession` (server-side fetch
to `/v1/auth/get-session`).

RGPD endpoints land under `/v1/user/*`:

- `GET /v1/user/data-export` — JSON download of profile, sessions,
  accounts (no secrets).
- `DELETE /v1/user/me` — soft-delete (sets `user.deleted_at`,
  revokes sessions). 30-day hard-delete is documented in
  [ADR-0013](docs/adr/0013-rgpd-compliance.md) but not implemented
  yet (no cron infra).

**Local dev setup:**

1. Create a Neon project (https://console.neon.tech) — copy the
   pooled connection string.
2. Generate a Better Auth secret: `openssl rand -base64 32`.
3. Fill `apps/api/.env`:
   ```
   DATABASE_URL=postgresql://...   # Neon pooled URL
   BETTER_AUTH_SECRET=...          # from openssl rand
   BETTER_AUTH_URL=http://localhost:4000
   # Optional:
   RESEND_API_KEY=...              # falls back to Pino logs if unset
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
4. Fill `apps/web/.env.local`:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:4000
   NEXT_PUBLIC_AUTH_URL=http://localhost:4000
   NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=false  # set to true when GOOGLE_* on the API are set
   ```
5. Run migrations: `pnpm db:migrate`.
6. `pnpm dev`.

The full env-var reference lives in each app's README
([api](apps/api/README.md), [web](apps/web/README.md)).

For deeper rationale, see:

- [ADR-0011](docs/adr/0011-authentication-strategy.md) — Better Auth
  + cookies + Fastify mount.
- [ADR-0012](docs/adr/0012-database-choice.md) — Neon + Drizzle +
  why the schema is hand-written (CLI lag).
- [ADR-0013](docs/adr/0013-rgpd-compliance.md) — data export + soft
  delete + cookie posture.

### Build-distributed model

Shared packages distribute **compiled artifacts** from `dist/` (built by `tsc`),
not raw `.ts` source. This is required because NestJS (`apps/api`) runs under
plain Node ESM, which cannot load `.ts` source directly.

- `pnpm build` compiles every shared package via Turborepo (cached, instant on
  subsequent runs).
- `pnpm dev` and `pnpm test` automatically run upstream `^build` tasks via
  Turbo's dependency graph — apps get freshly built packages before they start.
- Internal relative imports in package source use `.js` extensions
  (e.g. `import { cn } from '../lib/utils.js'`). TypeScript's Bundler resolution
  maps `.js` → `.ts` source at compile time; Node ESM loads the real `.js`
  artifact at runtime. This is the canonical ESM-on-TypeScript convention for
  compiled libraries.

For shared **tooling configs** loaded directly by tools (no build step — e.g.
`tooling/vitest/react.ts`), use `.ts` extensions and `allowImportingTsExtensions: true`
(set in `tooling/tsconfig/base.json`).

## Getting Started

### Prerequisites

- Node.js 22.x (use `nvm use` or read `.nvmrc`)
- pnpm 11+ (`npm install -g pnpm@11.1.1`)
- Git

### Installation

```bash
git clone https://github.com/toopo-io/toopo.git
cd toopo
pnpm install
```

### Environment variables

Each app owns its own `.env.example`. Copy and edit per app:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

See [apps/api/README.md](apps/api/README.md) and
[apps/web/README.md](apps/web/README.md) for the full variable list and
defaults.

### Common Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Run all dev servers (Turbo) |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Lint with Biome |
| `pnpm lint:fix` | Lint and auto-fix |
| `pnpm format` | Format code |
| `pnpm typecheck` | Run TypeScript type checks |
| `pnpm test` | Run all tests |
| `pnpm test:coverage` | Run tests with coverage |

## Conventions

### Commits

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`.

Allowed scopes: `web`, `api`, `landing`, `auth`, `db`, `ui`, `sdk`, `types`,
`config`, `ci`, `deps`, `release`, `repo`, `api-contracts`, `env`, `i18n`,
`tailwind`, `tsconfig`.

Examples:

```
feat(web): add graph viewport zoom controls
fix(api): correct locale negotiation fallback
chore(deps): bump turbo to 2.9.12
```

### Branches

- `main` — protected, always deployable
- `feat/<scope>-<short-description>`
- `fix/<scope>-<short-description>`

### Code Style

Enforced automatically by Biome on every commit (lefthook + CI):

- Single quotes, trailing commas, semicolons
- 100-column line width, 2-space indentation
- No `any`, no unused imports, no `console.log` (except `warn`/`error`)
- No non-null assertions outside tests

### Suppressing lint rules

Inline overrides are sometimes legitimate (e.g. React hook dependency lists
that intentionally omit a stable reference). Use a scoped Biome ignore with
a written reason on the **same line** the rule would otherwise fire:

```ts
// biome-ignore lint/correctness/useExhaustiveDependencies: <why this is correct>
useEffect(() => { /* ... */ }, [stableRef]);
```

Rules to never suppress: anything in `suspicious/*`, `security/*`, or
`performance/*`. If one of those fires, the right fix is to change the
code or add a permanent `overrides` entry in `tooling/biome/biome.json`.

## Quality Gates

Every push must pass:

1. **Biome** — lint + format
2. **TypeScript** — strict type checking
3. **Vitest** — 80% coverage threshold

Local enforcement via Lefthook; remote enforcement via GitHub Actions.

## Shared TypeScript configs

`tooling/tsconfig/` provides five variants. Apps and packages extend the one
that matches their runtime model:

| Variant | Use for | Module system | Resolution |
| --- | --- | --- | --- |
| `base.json` | Foundation only — not extended directly | ESM | Bundler |
| `node.json` | Modern Node services using native ESM (`"type": "module"`) | NodeNext | NodeNext |
| `node-classic.json` | NestJS or other CJS Node services. Decorators enabled, `verbatimModuleSyntax` off so ESM-style source can transpile to CJS via swc | CommonJS | Node10 |
| `nextjs.json` | Next.js apps | ESNext | Bundler |
| `library.json` | Shared packages emitting `.d.ts` (`composite: true`) | ESM | Bundler |

`apps/api` extends `node-classic.json` (NestJS uses CJS at runtime).
`apps/web` extends `nextjs.json`. All `packages/*` extend `library.json`.

## Trusted Dependencies

pnpm 11 blocks dependency postinstall scripts by default as a supply-chain
security measure. Any package that needs to run a build or install script
(typically to download a platform-specific binary or compile native code)
must be explicitly opted in via the `allowBuilds` map in
`pnpm-workspace.yaml`.

Currently configured:

```yaml
allowBuilds:
  lefthook: true       # Git hooks installer
  '@swc/core': true    # Native compiler for NestJS builds
  sharp: true          # Image optimization for Next.js
  '@scarf/scarf': false  # Telemetry beacon, opted out for privacy
  '@nestjs/core': false  # Telemetry banner, opted out
```

- **lefthook** — runs its `postinstall.js` to fetch the Go binary that
  executes our git hooks (pre-commit, commit-msg, pre-push).
- **@swc/core** — fetches the platform-specific SWC native binary used by
  `apps/api` (NestJS) at build/test time.
- **sharp** — fetches libvips bindings used by Next.js for image
  optimization in `apps/web`.
- **@scarf/scarf**, **@nestjs/core** — explicitly set to `false` to opt
  out of post-install telemetry beacons.

### Adding a new trusted dependency

Before adding a package to `allowBuilds`:

1. Inspect the package's `postinstall` / `install` script in `node_modules`
   to confirm it only performs expected work (binary download, native build).
2. Pin the dependency to an exact version in `package.json`.
3. Add it to `allowBuilds` with `true`, commit, and note the rationale in
   the commit message.

Never set `allowBuilds: <pkg>: true` blindly. Each entry is an explicit
trust statement about that package's install-time code execution.

## License

[GNU AGPL-3.0-or-later](./LICENSE) © 2026 Mathis Perron

Toopo is genuine OSI open source under the **GNU Affero General Public
License v3.0 or later** — free to use, self-host, study, and modify. The
network-copyleft clause (AGPL §13) means anyone who offers a modified Toopo
as a network service must release their changes under the same license. The
copyright holder retains the right to grant separate commercial licenses.
See [ADR-0019](docs/adr/0019-licensing.md) for the rationale.
