/**
 * The human-facing label for a graph node. Identity (`id`) is a SCIP descriptor
 * path — correct but unreadable; this derives the short, kind-appropriate name
 * the cartography shows. Pure and exhaustive over the five closed node kinds
 * (ADR-0015 §5), so a new kind would fail the switch at compile time.
 */
import type { Node } from '@toopo/core';

export function nodeLabel(node: Node): string {
  switch (node.kind) {
    case 'repo':
    case 'package':
    case 'symbol':
      return node.name;
    case 'file':
      return basename(node.path);
    case 'callSite':
      return node.callee;
  }
}

/** The last path segment (POSIX or Windows separators), falling back to the whole path. */
function basename(path: string): string {
  const segments = path.split(/[/\\]/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? path;
}
