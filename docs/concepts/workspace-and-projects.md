# Workspaces and projects

Toopo scopes access through a tenancy hierarchy:

```
User → Workspace → Project → Graph
```

**Membership** is the access predicate: you can read a project's graph if and only if you are a member of the workspace that owns it. This is defined in [ADR-0028](../adr/0028-workspace-membership-tenancy.md), which supersedes the earlier instance-tenant model.

## Project

A **project** is the administrative entity Toopo manages — distinct from the `repo` node *inside* the graph ([ADR-0022](../adr/0022-project-tenancy-and-graph-access-control.md)). The graph is keyed by a composite identity that begins with the project id, so two projects never share graph data. Creating a project is the job of the [connect-a-repo install flow](../getting-started/connect-a-repo.md) — that flow is the sole production creator of projects; the ingestion path never creates one.

## Workspace

A **workspace** is the tenancy boundary above the project. Technically it is a Better Auth *organization*, and membership in that organization is what grants access. A personal workspace is provisioned lazily the first time you sign in, so every user always has somewhere to put a project. Every project is permanently linked to exactly one workspace (the link is non-nullable).

Access is decided by `isMember(userId, project.workspace_id)`, and the workspace id is read from the **persisted project**, never from the request — so it cannot be spoofed by a crafted call.

## Moving a project between workspaces

A project can be moved from one workspace to another via `PATCH /v1/projects/:projectId/workspace`, under an owner gate: the caller must own the source workspace **and** be a member of the target. The move changes only which workspace owns the project — it never rewrites graph keys, so the graph's identity is unaffected.

---

**See also:** [REST API](../reference/rest-api.md) · [ADR-0028](../adr/0028-workspace-membership-tenancy.md) · [ADR-0022](../adr/0022-project-tenancy-and-graph-access-control.md).
