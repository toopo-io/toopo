# ADR 0017: Storage strategy — dual-backend persistence (SQLite self-host / Postgres cloud)

Date: 2026-06-08
Status: Accepted

Supersedes ADR-0012.

## Context

ADR-0012 committed to Neon Postgres + Drizzle ORM on Vercel/Render-style
ephemeral serverless compute — a single managed backend. That directly
contradicts Toopo's overriding constraint: **trivial self-hosting** — the
whole application must run on one SQLite file, with zero managed services
and no native build. This is the same constraint that chose Node's
built-in `sha256` over native xxHash in ADR-0015 and `web-tree-sitter`
over native bindings in ADR-0016.

This ADR replaces the single-backend stance with **one persistence
interface over two backends — SQLite (self-host) and Postgres (cloud) —
selected by configuration, not code.** It governs all relational
persistence: the Better Auth tables (`user`, `session`, `account`,
`verification`), and the deterministic code graph of ADR-0015 (nodes,
typed edges, typed properties), its content-hash cache, and the reverse
indexes the Serve pass builds for blast-radius traversal.

Storage is **downstream of ADR-0015**: it persists the universal model,
it does not redefine it. The task queue backend (Postgres vs Redis/BullMQ)
is explicitly **out of scope** and gets its own ADR next.

## Decision

1. **One persistence interface (repository pattern), two backends selected
   by configuration.** Self-host = one SQLite file; cloud = Postgres.
   Switching backend is a config change, never a code change.

2. **Kysely as the data-access layer, replacing Drizzle.** Drizzle has no
   dialect-agnostic schema: `pg-core` and `sqlite-core` are separate table
   builders and queries are bound to a dialect, so supporting both backends
   forces duplicated schemas and dialect-branching query code — failing
   "switch by config" and violating zero-duplication. Kysely offers one
   typed schema with the dialect chosen at runtime, first-class
   `withRecursive`, and stays close to SQL (which makes the portable-SQL
   discipline below natural rather than fought). The migration cost is
   small and mostly one-time: only the four-table auth layer moves; the
   entire graph schema is greenfield and pays zero migration cost to start
   on Kysely. This consciously reverses ADR-0012's ORM choice.

3. **Better Auth on its built-in Kysely adapter.** It is natively
   dual-backend (SQLite + Postgres) and generates the canonical auth
   schema from the *installed* better-auth version — retiring ADR-0012's
   hand-transcribed `auth.ts`, its schema-drift hazard, and its
   `@better-auth/cli` upgrade checklist, and restoring the conformance
   guarantee ADR-0012 lost. The `user.deletedAt` RGPD field (ADR-0013) is
   reattached as a Better Auth field extension, not a fork of the canonical
   schema.

4. **Explicit, committed auth migrations.** Better Auth's Kysely adapter is
   used at **maintainer time** to *generate* migration files; those files
   are committed to the repository and applied **explicitly** via a single
   `db:migrate` step — never runtime table creation, never migrate-on-boot
   (ADR-0008). "Auto-migration" here means maintainer-generated, not
   runtime-generated. This preserves the explicit-migration policy and
   keeps the public repo auditable. The `db:migrate` orchestration runs the
   two migrators in a **deterministic order — auth tables first, then the
   graph migrator** (see point 8).

5. **Graph stored as `node` + `edge` tables with a typed-columns + JSON
   hybrid.** Structural, queryable fields — kind, subKind, the SCIP-style
   identity path (ADR-0015 §4), `resolution`, `provenance`, `confidence`,
   `contentHash`, `analysisStatus`, source/target — are real **indexed
   columns**. The open, language-namespaced `properties` (ADR-0015 §5) are
   a **JSON column**. Edges are stored once in their natural direction
   (ADR-0015 §11); reverse traversal ("who calls X") is a **secondary
   index `edge(target_id, kind)`**, never duplicated rows, paired with
   `edge(source_id, kind)` for forward traversal.

6. **Portable-SQL discipline, CI-enforced against both backends.** Use
   `->>` only (its semantics are identical across SQLite ≥3.38 and
   Postgres; `->` is incompatible between them). Blast-radius traversal
   uses `WITH RECURSIVE` with a **visited-path column and a depth cap** for
   cycle safety — never Postgres's `CYCLE`/`SEARCH` clauses, which SQLite
   lacks. No arrays, no `jsonb`-only operators (`@>`, `?`,
   `jsonb_path_*`), everything parameterized. CI runs the same query suite
   against SQLite and Postgres so any non-portable construct fails fast.

7. **One logical database, two schema modules (auth, graph).** Physically
   unified for self-host (one file, one connection, one migrate run,
   cross-cutting transactions possible), with auth and graph kept as
   separate, namespaced schema modules so a future *physical* split for
   cloud scaling is a deployment/config change, not a redesign. The split
   itself is not built now (YAGNI); it is only kept possible.

8. **Migrations explicit, never on boot** (ADR-0008), files outside `src/`
   and loaded by their tool's convention (ADR-0010 category 2), applied via
   `db:migrate`. Two migrators (Better Auth's for the auth module, our
   Kysely migrator for the graph module) run in the deterministic order of
   point 4. Migration SQL obeys the point-6 portability rules.

9. **Build-free SQLite driver behind the interface: libSQL for v1.** The
   SQLite driver sits behind the persistence interface (a Kysely dialect)
   and is therefore swappable. **libSQL** (`@libsql/client` +
   `@libsql/kysely-libsql`) is chosen for v1: prebuilt binaries, no native
   compile on install, file-compatible with SQLite — honoring the
   no-native-build mandate. `better-sqlite3` is rejected (compiles on
   install, Kysely's default notwithstanding); `node:sqlite` is to be
   revisited once it leaves experimental status.

10. **Validate at the storage boundary.** Rows read back out of the store
    and rehydrated into graph objects are validated against the
    `packages/core` Zod schemas (ADR-0006, ADR-0015 trust-at-boundaries),
    so persistence can never reintroduce invalid graph state.

11. **Forward-compatibility (not designed here).** The schema leaves room
    for the later problem/kanban lifecycle — a mutable current graph on the
    default branch plus problems carrying `appeared@commit` /
    `resolved@commit`, **not** per-commit graph snapshots — and for the AI
    inferred overlay, which is stored and cached separately from the
    deterministic graph (ADR-0015). The detailed problem/kanban schema is a
    later ADR; this ADR only avoids precluding it.

## Consequences

- Self-hostable on one file by construction: a backend is a config flag,
  not a code path.
- ADR-0012's auth schema-drift hazard is eliminated — the canonical auth
  schema is generated from the installed better-auth version, and the
  manual `auth.ts` plus the upgrade checklist retire.
- The portable-SQL discipline is the standing cost: CI must run the query
  suite against both SQLite and Postgres, and contributors must respect the
  `->>`/recursive-CTE/no-arrays rules of point 6.
- Reversing the Drizzle choice is a one-time migration of a small auth
  layer; the graph schema, being greenfield, starts on Kysely directly.
- Accepted limits: SQLite is single-writer (acceptable for single-tenant
  self-host; enable WAL for concurrent readers) and deep recursive
  traversals must be capped/paginated; Postgres carries concurrent cloud
  load.
- Two migrators add minor orchestration, fixed by the deterministic
  auth-then-graph order of `db:migrate`.

## Alternatives considered

- **Keep Drizzle with two dialect schemas.** Rejected: `pg-core` and
  `sqlite-core` have no common table object (per Drizzle's own guidance),
  forcing duplicated schemas and dialect-branching queries — duplication
  the charter forbids, and "switch by maintaining two schemas" is not
  "switch by config".
- **Raw portable SQL + a thin dialect layer.** Rejected: hand-rolled where
  a proven, typed builder (Kysely) already expresses everything needed,
  including recursive CTEs.
- **Separate databases for auth vs graph.** Rejected as premature: it hurts
  self-host simplicity (two connections, two files). Kept possible via the
  two-schema-module split (point 7) without building it now.
- **`better-sqlite3` / `node:sqlite` drivers.** Rejected for v1:
  `better-sqlite3` compiles on install (fails the no-native-build mandate);
  `node:sqlite` is still experimental. libSQL is prebuilt and stable today.
- **Better Auth Drizzle adapter, or runtime auto-migration.** Rejected:
  the Drizzle adapter needs hand-generated per-dialect migrations and loses
  the built-in adapter's generation guarantee; runtime auto-creation
  violates ADR-0008's explicit-migration policy.

## Related ADRs

- **Supersedes ADR-0012** (Neon Postgres + Drizzle — single managed
  backend).
- ADR-0015 (universal code-graph model — the model this layer persists;
  storage-agnostic there, made concrete here).
- ADR-0016 (parsing and resolution — produces the graph this layer stores;
  the content-hash cache drives delta-only persistence).
- ADR-0006 (Zod as single source of truth — storage deserialization
  validates against the `core` schemas at the boundary).
- ADR-0008 (explicit migrations, never on boot).
- ADR-0010 (asset bundling — migrations are category-2 tool-consumed files
  outside `src/`).
- ADR-0013 (RGPD — `user.deletedAt` soft-delete, reattached as a Better
  Auth field extension).
- ADR-0004 (build-distributed shared packages — `@toopo/db` is one).
