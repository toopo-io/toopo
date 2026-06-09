import type { z } from 'zod';

/**
 * Typed extension point (ADR-0015 Fork 2): a `lang-*` package narrows a node
 * (or edge) schema's open `properties` bag to a refined, language-specific
 * shape for a given `subKind`.
 *
 * This is a PURE factory — it takes a base object schema and a properties
 * schema and returns a new schema with `properties` replaced. There is no
 * global registry and no mutable state: each consumer composes the schemas it
 * needs. The refined `properties` shape MUST still be JSON-safe (it is
 * persisted to a JSON column and crosses the wire) — a discipline core
 * documents but does not constrain at the type level, since a concrete object
 * shape is not assignable to a JSON index signature.
 *
 * @example
 *   const ReactComponentNode = withProperties(SymbolNodeSchema, ReactComponentProps);
 */
export function withProperties<Shape extends z.ZodRawShape, Props extends z.ZodType>(
  base: z.ZodObject<Shape>,
  properties: Props,
) {
  return base.extend({ properties });
}
