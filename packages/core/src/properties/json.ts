import { z } from 'zod';

/**
 * The open, language-namespaced `properties` bag of every node and edge
 * (ADR-0015 §5) is constrained in core only to be JSON-safe: it must
 * round-trip losslessly through storage (ADR-0017 JSON column) and the wire.
 *
 * `lang-*` packages refine it per-`subKind` downstream via `withProperties`
 * (Fork 2) — core stays thin and language-agnostic.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

/**
 * Numbers must be finite: `NaN`/`Infinity` are not representable in JSON
 * (`JSON.stringify` would silently coerce them to `null`), so they are
 * rejected at the boundary rather than corrupting the graph.
 */
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const JsonObjectSchema: z.ZodType<JsonObject> = z.lazy(() =>
  z.record(z.string(), JsonValueSchema),
);
