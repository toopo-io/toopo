# @toopo/db

Kysely data-access layer over a **dual backend** — SQLite (self-host) or
Postgres (cloud) — selected by configuration, with Better Auth on its built-in
Kysely adapter. Implements [ADR-0017](../../docs/adr/0017-storage-strategy.md)
(supersedes ADR-0012's Neon + Drizzle stance).

## One interface, two backends

The backend is inferred from the `DATABASE_URL` **scheme** — switching is a
config change, never a code change (ADR-0017 §1):

| Scheme | Backend | Driver |
| --- | --- | --- |
| `postgres://`, `postgresql://` | Postgres (cloud) | `pg` + Kysely `PostgresDialect` |
| `libsql://`, `sqlite://`, `file:`, `:memory:` | SQLite (self-host) | `@libsql/kysely-libsql` — prebuilt, no native build (ADR-0017 §9) |

```ts
import { createAuthDatabase } from '@toopo/db';

// SQLite self-host (one file) or Postgres cloud — same call, scheme decides.
const { betterAuthDatabase, userRepository, close } = createAuthDatabase({
  databaseUrl: process.env.DATABASE_URL,
});
```

`createAuthDatabase` returns everything the app needs — the object Better Auth's
adapter expects, the `UserRepository`, and a `close()` — so consumers never name
Kysely or the persistence implementation (fork F4). The same connection backs
both Better Auth and the repository.

## Layout

```
packages/db/
├── src/
│   ├── config.ts            # DATABASE_URL -> backend (Zod refine, not .url())
│   ├── dialect.ts           # libSQL | Postgres dialect
│   ├── database.ts          # createDatabase -> typed Kysely instance
│   ├── auth-database.ts     # createAuthDatabase -> { betterAuthDatabase, userRepository, close }
│   ├── auth-schema.ts       # schema-affecting Better Auth options (deletedAt)
│   ├── generate-auth-sql.ts # compile auth SQL from the installed better-auth
│   ├── migrator.ts          # Kysely Migrator over committed .sql files
│   ├── repositories/        # UserRepository interface + Kysely impl
│   └── schema/auth-types.ts # Kysely table types for the auth schema
├── migrations/
│   ├── sqlite/              # committed, dialect-specific SQL (tool-consumed, ADR-0010)
│   └── postgres/
└── (no ORM config — the schema is generated, see below)
```

## Migrations: committed SQL is the source of truth

Auth migrations are **generated at maintainer time** and **committed**; they are
applied **verbatim**, never re-derived at apply time (ADR-0017 §4):

1. **`pnpm db:generate`** compiles the Better Auth schema SQL **programmatically
   from the installed `better-auth`** (`getMigrations(...).compileMigrations()`),
   for both dialects, into `migrations/{sqlite,postgres}/0000_better_auth.sql`.
   This is version-matched to the running auth library — it does **not** use the
   standalone `@better-auth/cli`, which still lags the runtime and would
   reintroduce the schema-drift hazard ADR-0012 wrestled with. The `deletedAt`
   RGPD field (ADR-0013) is a Better Auth field extension (`additionalFields`);
   its index is the hand-authored follow-up `0001_user_deleted_at_idx.sql`
   (Better Auth emits no index for additional fields).
2. **`pnpm db:migrate`** applies the committed `.sql` files to `DATABASE_URL`
   via a Kysely `Migrator` — the single migration mechanism the graph schema
   (Chunk 2) will reuse. Explicit only; never on boot (ADR-0008).

**Drift-check (CI):** the pipeline re-runs `db:generate` and fails on any diff
against the committed migrations — catching an un-regenerated schema after a
`better-auth` bump or an `authSchemaOptions` change. This closes the
drift-detection gap ADR-0012 left explicitly open; combined with the live
dual-backend auth-flow e2e, the conformance guarantee ADR-0012 lost is restored.

Generation is hermetic (SQLite in-memory; Postgres via a throwaway
testcontainer), so it is reproducible with no external service.

## Boundary validation

Rows read back are normalized at the storage boundary (ADR-0006, ADR-0017 §10):
Postgres returns `Date`/`boolean`, libSQL returns ISO-string/`0|1`. The
repository's Zod schemas coerce both to one clean domain shape and strip session
tokens + account credentials from the RGPD export (ADR-0013).

## Portable-SQL discipline (carries into Chunk 2)

When the graph schema lands, all queries must stay portable across both backends
(ADR-0017 §6): use `->>` only (never `->`), `WITH RECURSIVE` with a
visited-path column + depth cap for traversal (never Postgres `CYCLE`/`SEARCH`),
no arrays, no `jsonb`-only operators, everything parameterized. The dual-backend
test harness runs the suite against SQLite **and** Postgres so any non-portable
construct fails fast. `kysely-codegen` from the migrated DB is the type-generation
path when the schema grows beyond the four auth tables.

## Testing

The suite runs against both backends (ADR-0017 §6): libSQL (temp file) and a
real Postgres via `@testcontainers/postgresql`. Postgres runs whenever Docker is
available and is **required** in CI (`CI=true`), so a misconfigured runner fails
loudly rather than silently skipping the Postgres leg.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm db:generate` | Regenerate the committed auth migration SQL for both dialects. |
| `pnpm db:migrate` | Apply committed migrations to `DATABASE_URL` (backend inferred). |

`db:migrate` loads env via Node's `--env-file=../../apps/api/.env`. Migrations
never run on boot (ADR-0008).
