# REST API

Toopo's read API is served by `apps/api` (NestJS). It is versioned: every path is mounted under `/v1`. This page documents the graph read endpoints — the surface the map and Insights are built on ([ADR-0020](../adr/0020-serve-pass-architecture.md)).

## Conventions

- **Scoping.** Every graph endpoint lives under `/v1/projects/:projectId/graph/*`, so the project is structurally present on every request ([ADR-0022](../adr/0022-project-tenancy-and-graph-access-control.md)).
- **Authorization.** Graph endpoints sit behind a session guard and a project-access guard: you must be authenticated and a member of the workspace that owns the project ([ADR-0028](../adr/0028-workspace-membership-tenancy.md)).
- **The node id is a query parameter** (`?id=…`), never a path segment, because a node id is a SCIP-style descriptor that contains `/`, spaces, and backticks.
- **Pagination is keyset-based.** Paginated endpoints take an opaque `cursor` and return the next one; round-trip it verbatim, never interpret it. They also accept a `limit`.

## Graph endpoints

All paths below are relative to `/v1/projects/:projectId/graph`.

| Method | Segment | Purpose |
| --- | --- | --- |
| GET | `/map` | The aggregate map at a containment level (package / file / symbol). |
| GET | `/node` | Composed node detail: the node plus its declared interface, neighbours, and call-sites. |
| GET | `/neighbors` | Paginated neighbours (callers/callees) of a node. |
| GET | `/blast-radius` | Bounded reverse-reachability — who depends on a node — with per-hit path trust. |
| GET | `/declared-interface` | A symbol's contained parameter/prop symbols. |
| GET | `/declarations` | A container's direct declarations (a package's files; a file's or symbol's members). |
| GET | `/call-sites` | The call-sites a symbol encloses. |
| GET | `/call-bindings` | A call-site's payload arguments stitched to the parameters/props they bind. |
| GET | `/search` | Node search by name, path, kind, or sub-kind. |
| GET | `/name-collisions` | **Insight:** top-level symbols sharing a name. |
| GET | `/unused-symbols` | **Insight:** top-level symbols with no detected incoming usage. |
| GET | `/cycles` | **Insight:** recursive cycles (strongly connected components) of the dependency graph. |

### Common parameters

- `id` — the node id (required by `node`, `neighbors`, `blast-radius`, `declared-interface`, `declarations`, `call-sites`, `call-bindings`).
- `limit`, `cursor` — keyset pagination on the paginated endpoints.
- `map` takes a `level` (`package` \| `file` \| `symbol`); `neighbors` takes a `direction` (`in` \| `out`) and an optional `kind`.
- `blast-radius` takes an optional `maxDepth`, defaulting to **32** (the reverse-traversal depth cap that bounds cost and guarantees termination on a cyclic graph).
- `search` takes an optional `query`, `kind`, and `subKind`.

## Other endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/health` | Liveness/readiness probe (the web container waits on it). |
| GET | `/v1/projects` | The active workspace's projects, keyset-paginated. |
| GET | `/v1/projects/:projectId` | One project by id. |
| PATCH | `/v1/projects/:projectId/workspace` | Move a project to another workspace (source-owner gated; [ADR-0028](../adr/0028-workspace-membership-tenancy.md)). |

The authentication routes (Better Auth under `/v1/auth/*`), the GitHub connect endpoints, the push-webhook receiver, and the RGPD user endpoints (`GET /v1/user/data-export`, `DELETE /v1/user/me`) are documented with their flows in [Connect a repository](../getting-started/connect-a-repo.md), [ADR-0024](../adr/0024-github-push-webhook-ingestion.md), and [ADR-0013](../adr/0013-rgpd-compliance.md).

---

**See also:** [Reading the map](../guides/reading-the-map.md) · [Graph edge kinds](graph-edge-kinds.md) · [The graph model](../concepts/graph-model.md).
