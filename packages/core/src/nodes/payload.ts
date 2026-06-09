import { z } from 'zod';
import { PASS_KINDS } from '../constants.js';
import { withResolution } from '../trust/resolution.js';

/**
 * One actual argument/prop passed at a call-site (ADR-0015 §7). The payload
 * carries the VALUE detail only — its `ordinal`, optional `name` (for named
 * args / JSX props), how it is passed, and an opaque `value` expression. The
 * binding to the receiving parameter/prop is NOT stored here: it is a
 * `references` edge (Fork 5), so "unused prop" stays a zero-in-degree graph
 * query with no duplicated parameter id.
 *
 * Statically unresolved values (spread `{...props}`, dynamic expressions) are
 * marked `inferred`/unknown via the shared trust discriminator (ADR-0015 §8).
 */
const payloadArgumentBaseShape = {
  ordinal: z.number().int().nonnegative(),
  name: z.string().min(1).optional(),
  passKind: z.enum(PASS_KINDS),
  value: z.string().optional(),
};

export const CallSitePayloadArgumentSchema = withResolution(payloadArgumentBaseShape);
export type CallSitePayloadArgument = z.infer<typeof CallSitePayloadArgumentSchema>;
