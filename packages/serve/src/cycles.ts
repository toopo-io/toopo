/**
 * D7 (ADR-0029) — recursive cycles as the strongly-connected components of the
 * dependency graph. SCC grouping is not expressible in portable recursive SQL, so
 * the db layer streams the induced cycle-candidate subgraph and this module groups
 * it in the Serve layer with **iterative** Tarjan (an explicit work stack, so a
 * deep graph never overflows the call stack).
 *
 * Determinism (ADR-0029 §9): adjacency lists, members, and the cycle list are all
 * sorted, so the same graph yields a byte-identical result regardless of edge
 * arrival order. Trust: a cycle is `candidate` iff ANY edge internal to its SCC is
 * inferred — we never assert a cycle that rests on a guess.
 */
import type { DependencyEdge } from '@toopo/db';

export interface Cycle {
  /** Deterministic id: the lexicographically smallest member id. */
  readonly id: string;
  /** Member ids, sorted, capped at the module's cycle-member cap (see `length`). */
  readonly members: readonly string[];
  /** The full member count (before the display cap). */
  readonly length: number;
  /** True iff any edge internal to the SCC is inferred (the cycle rests on a guess). */
  readonly candidate: boolean;
  /** True when `members` was capped below `length`. */
  readonly truncated: boolean;
}

/** Cap on members surfaced per cycle; a larger SCC is truncated honestly. */
const CYCLE_MEMBER_CAP = 100;

/** Group the dependency edges into recursive cycles (SCCs), each trust-marked. */
export function findCycles(edges: readonly DependencyEdge[]): Cycle[] {
  const adjacency = buildAdjacency(edges);
  const selfLoops = new Set(
    edges.filter((edge) => edge.sourceId === edge.targetId).map((edge) => edge.sourceId),
  );
  const cycles: Cycle[] = [];
  for (const component of tarjan(adjacency)) {
    const members = [...component].sort();
    // Tarjan emits every node as its own SCC, including a lone sink with no
    // back-edge; such a singleton is a cycle only if it self-loops. A
    // multi-member SCC is always a cycle.
    const isCycle =
      members.length > 1 || (members.length === 1 && selfLoops.has(members[0] as string));
    if (!isCycle) {
      continue;
    }
    const memberSet = new Set(members);
    const candidate = edges.some(
      (edge) =>
        memberSet.has(edge.sourceId) &&
        memberSet.has(edge.targetId) &&
        edge.resolution === 'inferred',
    );
    const capped = members.slice(0, CYCLE_MEMBER_CAP);
    cycles.push({
      id: members[0] as string,
      members: capped,
      length: members.length,
      candidate,
      truncated: members.length > capped.length,
    });
  }
  return cycles.sort(byId);
}

function byId(a: Cycle, b: Cycle): number {
  if (a.id < b.id) {
    return -1;
  }
  return a.id > b.id ? 1 : 0;
}

/** Successor adjacency, every node present (even sink targets), lists sorted. */
function buildAdjacency(edges: readonly DependencyEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  const ensure = (id: string): string[] => {
    const existing = adjacency.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const created: string[] = [];
    adjacency.set(id, created);
    return created;
  };
  for (const edge of edges) {
    ensure(edge.sourceId).push(edge.targetId);
    ensure(edge.targetId);
  }
  for (const successors of adjacency.values()) {
    successors.sort();
  }
  return adjacency;
}

/**
 * Iterative Tarjan's SCC. Each work-stack frame tracks a node and its next
 * successor index; on completing a node we pop its SCC at a root and propagate the
 * lowlink to the parent frame — the faithful non-recursive translation.
 */
function tarjan(adjacency: Map<string, string[]>): string[][] {
  const indexOf = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const sccStack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  for (const start of [...adjacency.keys()].sort()) {
    if (indexOf.has(start)) {
      continue;
    }
    const work: Array<{ node: string; next: number }> = [{ node: start, next: 0 }];
    while (work.length > 0) {
      const frame = work[work.length - 1] as { node: string; next: number };
      const node = frame.node;
      if (frame.next === 0) {
        indexOf.set(node, counter);
        lowlink.set(node, counter);
        counter += 1;
        sccStack.push(node);
        onStack.add(node);
      }
      const successors = adjacency.get(node) as string[];
      if (frame.next < successors.length) {
        const child = successors[frame.next] as string;
        frame.next += 1;
        if (!indexOf.has(child)) {
          work.push({ node: child, next: 0 });
        } else if (onStack.has(child)) {
          lowlink.set(node, Math.min(lowlink.get(node) as number, indexOf.get(child) as number));
        }
        continue;
      }
      if (lowlink.get(node) === indexOf.get(node)) {
        const component: string[] = [];
        for (;;) {
          const popped = sccStack.pop() as string;
          onStack.delete(popped);
          component.push(popped);
          if (popped === node) {
            break;
          }
        }
        components.push(component);
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent !== undefined) {
        lowlink.set(
          parent.node,
          Math.min(lowlink.get(parent.node) as number, lowlink.get(node) as number),
        );
      }
    }
  }
  return components;
}
