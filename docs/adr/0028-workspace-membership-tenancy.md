# ADR 0028: Workspace & membership tenancy

Date: 2026-06-11

Status: Accepted

## Context

ADR-0022 §2 made an OSS instance a single tenant: any authenticated user
could reach any project. That collapses the moment two people share an
instance — the product needs a boundary a user controls. This ADR adds a
**Workspace** layer above the project (`User → Workspace → Project →
Graph`) and makes **membership** the access predicate. It **supersedes
only ADR-0022 §2** (instance-tenant authorization); §1, §3–§6 — the
administrative project entity, the composite-PK + mandatory `GraphScope`
data scoping, the portable SQL, the API guard, the greenfield handling —
all stand. It extends ADR-0017 and leaves ADR-0015 untouched.

## Decision

1. **Workspace = a Better Auth organization (F4).** We adopt the
   organization plugin rather than hand-roll tenancy: `organization` IS a
   Workspace, `member` IS a Membership. Row definitions and every write
   keep the library's column names verbatim; `WorkspaceTable` /
   `MembershipTable` type aliases let domain code speak the product term.
   Better Auth owns every membership **write**; Toopo only ever **reads**
   `member` behind `MembershipRepository` — a pure read seam (ADR-0017 §1).

2. **A personal Workspace is provisioned lazily (F2/Phase 1b).** Session
   creation ensures the user has an active workspace (`name 'Personal'`,
   `slug user-<id>`, one owner member); fail-soft. `findFirstWorkspaceId`
   (oldest membership, id-tiebroken) resolves the active workspace.

3. **Every project belongs to a Workspace (Phase 2).**
   `project.workspace_id` lands **NOT NULL**, a logical no-FK reference to
   `organization` (ADR-0017 §7 forbids cross-module FKs; integrity is
   enforced at the boundary, as `owner_user_id` is). At-rest data is
   backfilled in three tiers: (1) the owner's earliest membership; (2) else
   a synthesized personal workspace identical in shape to Phase 1b (same
   unique slug → a later sign-in converges, never duplicates); (3) else one
   members-less `orphaned-workspace` sentinel — inaccessible until reassigned,
   the correct posture under membership access. A parity test pins the SQL
   to the single personal-workspace convention.

4. **Access is membership-scoped (Phase 3).** A user reaches a project iff
   `isMember(userId, project.workspace_id)`. The `ProjectAccessGuard` reads
   the workspace from the **persisted** project, never the request, so it
   cannot be spoofed; `list` returns only the caller's-workspace projects.
   This is the predicate that supersedes ADR-0022 §2.

5. **Re-home on revive when the owner lost access (HIGH-2).** On re-connect
   the install flow re-homes a revived project (sets `workspace_id`) **only**
   when the re-installing owner is no longer a member of its current
   workspace; a placement they still belong to is respected. The install
   flow stays the sole production project creator (ADR-0026); the consume
   path never creates.

6. **A project may be moved between Workspaces (Phase 5).** `PATCH
   /v1/projects/:projectId/workspace` re-homes a project under an **Option B
   owner gate**: the caller must **own the source** workspace AND be a
   **member of the target**, both verified server-side. The source-owner
   check reads Better Auth's native `member.role = 'owner'`
   (`isWorkspaceOwner`) — the only place Toopo reads the role, localized to
   this one mutating decision so `isMember` stays role-agnostic. A
   non-member or non-existent target is denied (no leak); same-workspace is
   an idempotent no-op that **still requires ownership** (no triviality
   bypass). The move changes only `project.workspace_id` — never graph keys;
   `GraphScope` stays `{ projectId }` with a stable `project_id` (the locked
   invariant). It is the only mutation of tenancy placement outside the
   install flow.

## Consequences

- The instance is no longer one tenant: the boundary is the Workspace, and
  the cloud per-org rule remains one isolated predicate away.
- A deliberately-deferred **instance-admin** escape hatch would extend the
  single membership check (`member || session.isInstanceAdmin`) and the
  superseded all-projects listing — noted, **not built**.
- Three noted seams, **not built**: an observability signal for the
  members-less orphan sentinel; a keyset cursor that includes `workspace_id`
  if cross-workspace listing is ever added; a "no active workspace" client
  signal for the fail-soft provisioning gap.
- `@toopo/core` is untouched; this extends ADR-0017 additively.

## Alternatives considered

- **Hand-rolled tenancy tables.** Rejected: the Better Auth organization
  plugin is proven, owns the write-side invariants, and ships invitations;
  re-implementing it is debt (ADR-0011 reuse stance).
- **Granular RBAC (`createAccessControl`).** Rejected: the move gate needs
  exactly one role distinction (owner); the native role suffices, and an
   access-control DSL is speculative generality (YAGNI).
- **A move that relocates graph data.** Rejected: graph identity is
  `(project_id, …)`; moving it would break the composite-PK invariant
  (ADR-0022 §3). Only the administrative placement moves.
- **No-op move skips the owner check.** Rejected (Option A chosen): a
  boundary-changing endpoint must require ownership uniformly; a triviality
  bypass is an authorization gap.

## Related ADRs

- ADR-0022 (project tenancy — §2 superseded here; §1, §3–§6 stand),
  ADR-0017 (storage — extended: the workspace link, dual-backend backfill),
  ADR-0011 (auth — Better Auth, organization plugin), ADR-0026 (GitHub-App
  connect — the install flow as sole creator; the revive re-home),
  ADR-0006 (Zod at the boundary), ADR-0014 (route URLs centralized).
