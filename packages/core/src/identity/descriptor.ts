import { z } from 'zod';
import { DESCRIPTOR_SUFFIXES } from '../constants.js';

/**
 * One segment of a stable identity path (ADR-0015 §4), modeled on SCIP
 * descriptors (verified against sourcegraph/scip `scip.proto`). The `suffix`
 * names the structural role of the segment; `disambiguator` separates segments
 * that share a name and enclosing scope — overloaded `method`s, and shadowing
 * `local` bindings (ADR-0027) — and is meaningful only for those two suffixes.
 */
export const DescriptorSuffixSchema = z.enum(DESCRIPTOR_SUFFIXES);
export type DescriptorSuffix = z.infer<typeof DescriptorSuffixSchema>;

export const DescriptorSchema = z
  .object({
    name: z.string().min(1),
    suffix: DescriptorSuffixSchema,
    disambiguator: z.string().optional(),
  })
  .strict();
export type Descriptor = z.infer<typeof DescriptorSchema>;
