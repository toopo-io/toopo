# Your first analysis

This walks you from a running Toopo instance to reading the graph of a real repository. It assumes you have already [self-hosted the stack](self-host.md) and have it open at <http://localhost:3000>.

## 1. Connect a repository

The production way to get a repository into Toopo is the GitHub-App connect flow. Follow [Connect a repository](connect-a-repo.md) to register an App, set its credentials, and connect one or more repos. When you finish, Toopo:

1. Records the installation and creates one **project** per connected repository.
2. Resolves each repository's default-branch HEAD commit and enqueues it as a **first scan**.

> No GitHub App yet? The stack still runs without one, and the worker can ingest a checkout directly via its populate path — see [`apps/worker/README.md`](../../apps/worker/README.md). The connect flow is the production route and the rest of this page assumes it.

## 2. Watch the first scan

A job goes through the [worker](../../apps/worker/README.md), which:

- Shallow-clones the repository at the target commit in a sandbox (private repos authenticate with a short-lived installation token fed to `git` through `GIT_ASKPASS` — never in the URL, argv, or logs).
- Computes a content hash per file and compares it to what's stored: changed and new files are re-parsed, removed files are dropped, unchanged files are skipped. The first scan parses everything.
- Runs Parse → Resolve and persists the resulting graph for the project.

Follow it in the logs:

```bash
docker compose logs -f worker
```

## 3. Open the map

Back in the web UI, pick the project. You start at the **package** level and zoom in — package → file → symbol → call-site — with every level derived from the one graph, no re-parsing. From any symbol you can open its detail, walk its neighbours (who calls it, what it calls), and run a [blast radius](../guides/reading-the-map.md) to see what depends on it.

## 4. Look at the Insights

Open the **Insights** view for a deterministic, repository-wide read: [name collisions, unused symbols, and recursive cycles](../guides/insights.md). Each finding is marked *certain* or *candidate*, so you always know what Toopo can prove.

## 5. Push a change

Push a commit to the connected repository. The push webhook enqueues a delta scan, the worker re-parses only the files whose content changed, and the graph updates. That is the steady state: continuous, delta-only cartography on every push.

---

**See also:** [Reading the map](../guides/reading-the-map.md) · [Insights](../guides/insights.md) · [How the graph works](../concepts/how-the-graph-works.md).
