# What is Toopo

Toopo is continuous, deterministic cartography of a codebase. A parser turns a repository into a rich, queryable graph of symbols, dependencies, and usages — refreshed on every push, delta-only. The graph is the foundation feature; everything else is built on it.

## The map

From the graph, Toopo derives a zoomable map of your code. You can see what a component expects, what calls what and with which props, which symbols have no detectable usage, and where dependencies form recursive cycles — zooming from package level down to a single call-site without ever re-parsing. Every zoom level is a view computed on read over the one detailed graph.

## Trust is the point

Toopo detects deterministically wherever it can, and the graph itself is the proof of impact. Certain and uncertain are always distinguishable: every edge is tagged `deterministic` or `inferred`, and a result is presented as a fact only when it can be proven. Toopo never asserts "nothing breaks" as a certainty, and it prefers to miss a real issue over raising a false one. See [how the graph works](how-the-graph-works.md) and [what Toopo cannot do](what-toopo-cannot-do.md).

## Open source and self-hostable

Toopo is genuine open source under [AGPL-3.0-or-later](../../LICENSE) and fully self-hostable — [one `docker compose` command](../getting-started/self-host.md) brings up the whole product on your own infrastructure. Your code never has to leave your machine.

## What's planned

The same graph is designed to power more than the map. A **scoped AI analysis** will target a node and traverse the graph instead of feeding a whole repository to a language model; its findings will become kanban cards tracked across commits, and an accepted fix will open a pull request you review (never auto-merged). That layer is **planned** — it is not in the shipped deterministic product today, and the line between the two is kept deliberately sharp. See [what Toopo cannot do](what-toopo-cannot-do.md).

---

**See also:** [How the graph works](how-the-graph-works.md) · [The graph model](graph-model.md) · [Architecture overview](../architecture/overview.md).
