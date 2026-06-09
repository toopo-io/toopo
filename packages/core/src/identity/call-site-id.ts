import { z } from 'zod';
import type { Descriptor } from './descriptor.js';
import { formatSymbolId, parseSymbolId, type SymbolId } from './symbol-id.js';

/**
 * Call-site identity (ADR-0015 §4) — BEST-EFFORT, not stable. It is the
 * enclosing symbol's id, plus the callee reference, plus a source-order
 * ordinal among identical calls. This key can shift when calls are added,
 * removed, or reordered within the enclosing symbol; consequently any
 * cross-commit tracking must anchor to Symbol or File and treat the call-site
 * id only as a refinement pointer (ADR-0015 §4 consequences).
 *
 * The id is DERIVED from these inputs (a deterministic encoding, not an
 * independent source of truth): the enclosing path gains one trailing `meta`
 * descriptor encoding `callee#ordinal`. Because the descriptor codec escapes
 * arbitrary names, the result is always a valid, parseable `SymbolId`.
 */
export const CallSiteIdentityInputSchema = z
  .object({
    enclosingSymbolId: z.string().min(1),
    calleeReference: z.string().min(1),
    ordinal: z.number().int().nonnegative(),
  })
  .strict();
export type CallSiteIdentityInput = z.infer<typeof CallSiteIdentityInputSchema>;

export function composeCallSiteId(input: CallSiteIdentityInput): SymbolId {
  const { enclosingSymbolId, calleeReference, ordinal } = CallSiteIdentityInputSchema.parse(input);
  const enclosing = parseSymbolId(enclosingSymbolId);
  const callDescriptor: Descriptor = {
    name: `${calleeReference}#${ordinal}`,
    suffix: 'meta',
  };
  return formatSymbolId({
    ...enclosing,
    descriptors: [...enclosing.descriptors, callDescriptor],
  });
}
