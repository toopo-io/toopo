# Toopo documentation

Toopo turns a repository into a deterministic, queryable graph of its symbols, dependencies, and usages — refreshed on every push, delta-only — and lets you explore it from package level down to a single call-site. These docs are organised so you can find the right page by what you're trying to do.

## Getting started

Step-by-step, from zero to a live graph.

- **[Self-host with Docker Compose](getting-started/self-host.md)** — bring up the whole stack in one command.
- **[Connect a repository](getting-started/connect-a-repo.md)** — register a GitHub App and stream pushes into Toopo.
- **[Your first analysis](getting-started/first-analysis.md)** — from a connected repo to reading the map.

## Concepts

Understand how Toopo works and what it does — and does not — claim.

- **[What is Toopo](concepts/what-is-toopo.md)** — the product in one page.
- **[How the graph works](concepts/how-the-graph-works.md)** — Parse → Resolve → Serve, and the determinism guarantee.
- **[What Toopo cannot do](concepts/what-toopo-cannot-do.md)** — the honest limits.
- **[The graph model](concepts/graph-model.md)** — nodes, edges, and the `deterministic` / `inferred` distinction.
- **[Workspaces and projects](concepts/workspace-and-projects.md)** — how access is scoped.
- **[Glossary](concepts/glossary.md)** — the vocabulary, defined once.

## Guides

Task-focused how-tos.

- **[Reading the map](guides/reading-the-map.md)** — navigating the canvas.
- **[Insights](guides/insights.md)** — name collisions, unused symbols, recursive cycles.
- **[Using Postgres](guides/using-postgres.md)** — the production database overlay.
- **[Troubleshooting](guides/troubleshooting.md)** — common self-host issues.

## Reference

Exact values, copied from the code.

- **[REST API](reference/rest-api.md)** — the graph read endpoints.
- **[Environment variables](reference/environment-variables.md)** — every setting.
- **[Graph edge kinds](reference/graph-edge-kinds.md)** — the relationship vocabulary.

## Architecture

How the system is built and why.

- **[Overview](architecture/overview.md)** — the three layers and the pipeline.
- **[Why Toopo](architecture/why-toopo.md)** — the principles behind the design.
- **[Decision records](adr/README.md)** — the binding ADRs.

## Contributing

- **[Development setup](contributing/development-setup.md)**
- **[Adding a language](contributing/adding-a-language.md)**
- **[Verification gates](contributing/verification-gates.md)**
