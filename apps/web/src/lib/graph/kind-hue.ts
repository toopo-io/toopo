/**
 * The gentle per-node hue on the cartography (the Minimal design's `--k-*` kind
 * tokens). A node's colour is a PRESENTATION refinement of its kind: structural
 * kinds (package, file) map straight to a hue, while a symbol is coloured by its
 * `subKind` — a React component, a hook, a type, or the generic "function" hue
 * for everything else (the default symbol colour).
 *
 * This map lives in the web presentation layer BY DESIGN (the subKind→category
 * boundary): the subKind string literals are language-specific and confirmed
 * against `packages/lang-react/src/subkinds.ts`, but are NEVER imported from
 * lang-react (the dependency boundary) and NEVER added to core/api-contracts
 * (which stay language-agnostic). Trust is a separate axis (solid/dashed); this
 * is only the kind hue.
 */
import type { Node as GraphNode } from '@toopo/core';

export type KindHue = 'component' | 'hook' | 'function' | 'type' | 'file' | 'package';

/**
 * Salient subKinds → hue. Confirmed against lang-react's SUBKIND map (ADR-0027):
 * `react:component`, `react:hook`, `ts:type|interface|class`, and the callables.
 * Any other symbol subKind (variables, parameters, props, fields) falls through
 * to the generic `function` hue rather than inventing a colour.
 */
const SUBKIND_HUE: Readonly<Record<string, KindHue>> = {
  'react:component': 'component',
  'react:hook': 'hook',
  'ts:type': 'type',
  'ts:interface': 'type',
  'ts:class': 'type',
  'ts:function': 'function',
  'ts:method': 'function',
  'ts:getter': 'function',
  'ts:setter': 'function',
};

export function kindHue(kind: GraphNode['kind'], subKind?: string): KindHue {
  if (kind === 'package' || kind === 'repo') {
    return 'package';
  }
  if (kind === 'file') {
    return 'file';
  }
  // symbol / callSite: refine by subKind, defaulting to the generic symbol hue.
  return (subKind !== undefined ? SUBKIND_HUE[subKind] : undefined) ?? 'function';
}

/** The CSS custom property reference for a node's kind hue (see base.css `--k-*`). */
export function kindHueVar(kind: GraphNode['kind'], subKind?: string): string {
  return `var(--color-kind-${kindHue(kind, subKind)})`;
}
