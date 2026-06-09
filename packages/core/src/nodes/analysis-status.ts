import { z } from 'zod';
import { ANALYSIS_STATUSES } from '../constants.js';

/**
 * Graceful degradation (ADR-0015 §9): every analyzed entry records its
 * outcome. A non-`analyzed` outcome MUST carry a human-readable reason, so a
 * skipped or broken input is always explained rather than silently dropped.
 * The invariant is enforced structurally via a discriminated union.
 */
export const AnalysisStatusSchema = z.enum(ANALYSIS_STATUSES);
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;

export const AnalysisSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('analyzed') }).strict(),
  z.object({ status: z.literal('unsupported-language'), reason: z.string().min(1) }).strict(),
  z.object({ status: z.literal('parse-error'), reason: z.string().min(1) }).strict(),
  z.object({ status: z.literal('skipped'), reason: z.string().min(1) }).strict(),
]);
export type Analysis = z.infer<typeof AnalysisSchema>;
