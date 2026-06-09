import { z } from 'zod';
import { DESCRIPTOR_SUFFIXES } from '../constants.js';

/**
 * One segment of a stable identity path (ADR-0015 §4), modeled on SCIP
 * descriptors (verified against sourcegraph/scip `scip.proto`). The `suffix`
 * names the structural role of the segment; `disambiguator` distinguishes
 * overloaded methods and is meaningful only for the `method` suffix.
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
