import { z } from 'zod';
import { CONFIDENCE_LEVELS, PROVENANCE_PASSES } from '../constants.js';

/**
 * The trust model (ADR-0015 §8): every fact is either statically
 * `deterministic` or heuristically `inferred`, and the two are structurally
 * separable. Confidence is carried ONLY by inferred facts; a deterministic
 * fact has no confidence at all. This invariant is enforced by the type
 * system and at runtime via a discriminated union — it cannot be violated by
 * convention drift.
 */
export const ConfidenceSchema = z.enum(CONFIDENCE_LEVELS);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Which pass/rule produced a fact (ADR-0015 §8, Fork 7). */
export const ProvenanceSchema = z
  .object({
    pass: z.enum(PROVENANCE_PASSES),
    rule: z.string().min(1),
  })
  .strict();
export type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * Wrap a base shape with the trust discriminator, yielding a discriminated
 * union on `resolution`:
 *   - `deterministic` — the base shape, with NO `confidence` field (a strict
 *     object rejects one).
 *   - `inferred` — the base shape plus a REQUIRED `confidence`.
 *
 * Shared by edges and call-site payload arguments so the §8 invariant is
 * expressed exactly once (zero duplication).
 */
export function withResolution<Shape extends z.ZodRawShape>(baseShape: Shape) {
  return z.discriminatedUnion('resolution', [
    z.object({ ...baseShape, resolution: z.literal('deterministic') }).strict(),
    z
      .object({ ...baseShape, resolution: z.literal('inferred'), confidence: ConfidenceSchema })
      .strict(),
  ]);
}
