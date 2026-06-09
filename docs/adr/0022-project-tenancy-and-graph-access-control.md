# ADR 0022: Project tenancy & graph access control

Date: 2026-06-10

Status: Accepted

## Context

The system serves exactly one graph, unguarded: `apps/api`'s graph
endpoints are public (no session guard) and storage holds a single
undifferentiated `node`/`edge` set keyed by global primary keys
(`node.id`, `edge.edge_key`). To onboard real repos (the rest of phase B
— webhook → queue → worker → GitHub App), the graph must (a) be scoped to
a **project** (a connected repo; one instance holds several) and (b) be
**gated behind auth** — it will hold the user's private code. This closes
the access-control gap carried since the Serve/UI work (Fork 5). This ADR
records the tenancy model, the scoping mechanism, and the access-control
line; it **extends** ADR-0017 (it does not supersede it — the
dual-backend, repository-pattern, and portable-SQL decisions all stand)
and leaves ADR-0015 (the universal graph model) untouched.

## Decision

1. **Project is an administrative entity, distinct from the graph `repo`
   node.** A `project` (id, repo host/owner/name, optional installation
   id, `owner_user_id`, timestamps) is the connection/tenancy record; the
   ADR-0015 §2 `repo` node remains graph identity. They are never
   conflated. The entity lives in `@toopo/db` as a third schema module
   (alongside `auth` and `graph`); its read contract lives in
   `@toopo/api-contracts`. It is **not** in `@toopo/core` — core is the
   universal *graph* model only, and a project is not graph data. **No
   `@toopo/core` change.**

2. **Instance-tenant authorization for the OSS self-host.** An OSS
   instance is one tenant: the graph authorization predicate is
   *authenticated session* — any signed-in user of the instance may list
   and open any project on it. `owner_user_id` is recorded (provenance +
   future isolation) and the predicate is isolated in a single
   `canAccessProject(session, project)` function, so per-user/org cloud
   isolation is a localized change in a future hosted ADR. Billing and
   hosted-only concerns stay out of this repo.

3. **Graph scoped by composite primary key.** `project_id` becomes part of
   the key — `node(project_id, id)`, `edge(project_id, edge_key)` — not a
   mere filter column. This is load-bearing: the same SCIP descriptor path
   (`SymbolId`) collides across repos, so a global PK is unsound under
   multi-tenancy; the composite PK both removes the collision and makes
   `project_id` implicitly `NOT NULL` on both backends (no sentinel, no
   `ALTER`). A mandatory `GraphScope { projectId }` value object is the
   first parameter of every `GraphRepository` read and write, so a read
   cannot be issued without naming the tenant — isolation is enforced by
   the type system, beneath the API guard (defense-in-depth).

4. **Portable scoping preserved (ADR-0017 §6).** Every scoped query adds a
   `project_id = ` equality on a bound parameter — including the recursive
   blast-radius CTE's self-join and node hydration, and every map
   aggregate join. No new dialect-specific construct is introduced, so the
   dual-backend CI remains the portability proof.

5. **Access control.** The graph API mounts under a path segment
   `/v1/projects/:projectId/graph/*` behind the existing `SessionGuard`
   plus a new `ProjectAccessGuard` (resolves and authorizes `:projectId`,
   404 on unknown, attaches the project). Project **creation** is the
   worker's job for now (resolve-or-create from repo coordinates); the API
   is read-only (list/get); public connect is deferred to the GitHub-App
   phase.

6. **Greenfield data handling.** The graph tables are pre-launch and hold
   only Toopo's reproducible dogfood graph, so the scoping migration
   **drops and recreates** `node`/`edge` with the composite PK +
   project-leading composite indexes (portable; safe with no data to
   preserve), and the worker re-ingests clean under a default project. No
   backfill. Committed migrations are never edited in place — this is a new
   forward migration.

## Consequences

- Fork 5 closed at two layers: the API guard, and — beneath it — the
  composite-PK + mandatory-`GraphScope` data layer that cannot return a
  cross-project row even if a guard were ever bypassed.
- The OSS tenancy line stays lean; the cloud per-user/org rule is one
  isolated predicate away.
- Standing cost: every graph read/write carries a scope, and the
  portable-SQL discipline now also covers the scoped joins/CTE.
- `@toopo/core` is untouched; this extends ADR-0017 §5/§11 additively.

## Alternatives considered

- **`project_id` as a plain filter column (global PK retained).** Rejected:
  `SymbolId` collisions across repos make a global PK unsound, and a
  forgettable filter is the exact Fork-5 risk; the composite PK is
  structural.
- **Project entity in `@toopo/core`.** Rejected: core is the graph model;
  tenancy is not graph data (ADR-0015).
- **Per-user isolation in the OSS repo now.** Rejected: multi-tenant-SaaS
  complexity the self-host scope does not need; deferred to a hosted ADR.
- **Backfill-migrate the existing rows.** Rejected: the only data is
  reproducible dogfood; a clean re-ingest makes the drop+recreate safe and
  removes backfill code.

## Related ADRs

- ADR-0015 (universal graph model — untouched; `repo` node vs project
  entity), ADR-0017 (storage — extended: composite PK, scoped portable
  SQL), ADR-0020 (Serve — the read API now carries a scope), ADR-0011
  (auth — the session guard reused), ADR-0006 (Zod at the boundary),
  ADR-0014 (route URLs centralized).
