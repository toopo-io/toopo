# Reading the map

The map is the graph, made navigable. Everything on it is derived on read from the one detailed graph — zooming never re-parses. This guide explains what you can do with it; the exact endpoints behind each action are in the [REST API reference](../reference/rest-api.md).

## Zoom levels

The map has three levels of grain, and you move between them freely:

- **Package** — the top-level containers (workspaces of a monorepo, or the repo itself).
- **File** — the source files within a package, and the dependencies between them.
- **Symbol** — the declarations within a file: functions, classes, components, types, and their declared parameters/props.

Roll-up is aggregation over containment: a package-level edge summarises the file- and symbol-level edges beneath it.

## Node detail

Open any node to see its detail: its declared interface (the parameters or props it expects, each with its type where statically known), its neighbours, and the call-sites it encloses. For a component, the declared interface is "what this component expects"; for a call-site, the payload is "what was actually passed."

## Neighbours

From a symbol you can walk its neighbours in either direction:

- **Outgoing** — what this symbol calls, references, extends, or implements.
- **Incoming** — what calls or references this symbol (its callers).

Neighbour lists are paginated, so a heavily-used symbol stays responsive.

## Blast radius

A blast radius answers "if I change this, what could break?" — the set of symbols that depend on the target, directly or transitively, walked backwards over the usage edges up to a bounded depth.

Each hit carries its own **path trust** ([ADR-0021](../adr/0021-blast-radius-per-hit-path-trust.md)): a hit is `deterministic` when *some* fully-proven dependency path reaches it, and `inferred` when *every* path to it crosses at least one inferred edge. Trust and depth are independent — a deep hit can still be fully proven. This is what lets you separate "definitely affected" from "possibly affected" instead of treating the whole radius as equally certain.

## Search

Search finds nodes by name, path, kind, or sub-kind — your entry point into a large graph when you already know what you're looking for.

---

**See also:** [Insights](insights.md) · [REST API](../reference/rest-api.md) · [The graph model](../concepts/graph-model.md).
