import { z } from 'zod';
import { UNRESOLVED_REFERENCE_CODES } from '../constants.js';

/**
 * The persisted, honest tail of the Resolve pass (ADR-0016 amendment + C11
 * closure): one import OR call-site usage that could NOT be bound to a precise
 * symbol, kept as a first-class sibling of the graph rather than dropped. It is
 * NOT a graph node or edge — a fabricated edge would assert a dependency we cannot
 * prove (the trust principle) — but it must be queryable, so a later
 * "unused"/"cycle" view never reads a resolution gap as genuine absence (the
 * cardinal false positive).
 *
 * `specifier` is the SOURCE TOKEN that triggered the reference, by code family:
 *   - import gaps (`*-module`, `*-export`): the module specifier as written
 *     (`./button`, `@app/ui`);
 *   - usage gaps (`unresolved-member`, `unbound-callee`): the callee expression as
 *     written (`Form.Item`, `handler.run`).
 * It is part of identity (ADR-0015 §11), so two distinct roots in one file
 * (`Form.Item` vs `Tabs.Item`) stay distinct rows.
 *
 * `targetFileId` + `name` mark an ANCHORED gap — the module/root resolved to a
 * known file, but the `name` did not bind in it. It is the same shape for an
 * `unresolved-export` (the export name) and an `unresolved-member` (the member
 * name), which is what lets the honesty query "does this file have an unresolved
 * inbound usage of this name?" answer both uniformly. An ANCHORLESS gap
 * (`*-module`, `unbound-callee`) has no resolved target file: `*-module`'s
 * specifier matched no/ambiguous file; `unbound-callee`'s callee root (a
 * local/param) never resolved — it carries the member `name` only, so the gap
 * broadens the candidate set by name alone (sound, coarse: the price of a lost
 * root type).
 */
export const UnresolvedReferenceCodeSchema = z.enum(UNRESOLVED_REFERENCE_CODES);
export type UnresolvedReferenceCode = z.infer<typeof UnresolvedReferenceCodeSchema>;

export const UnresolvedReferenceSchema = z
  .object({
    /** Why the binding failed (import vs usage; module/export/member; unresolved vs ambiguous). */
    code: UnresolvedReferenceCodeSchema,
    /** The id of the file whose import/usage could not be bound. */
    importerFileId: z.string().min(1),
    /** The source token of the reference: the module specifier for import gaps, the
     * callee expression for usage gaps (see the type doc). Part of identity. */
    specifier: z.string().min(1),
    /** For an ANCHORED gap (`*-export`, `unresolved-member`), the resolved file the
     * unbound name should live in (the usage's target). Absent when anchorless. */
    targetFileId: z.string().min(1).optional(),
    /** The unbound name: the export name for `*-export`, the member name for a usage
     * gap (`unresolved-member`, `unbound-callee`). Absent for a `*-module` gap. */
    name: z.string().min(1).optional(),
    /** A human-readable reason, for diagnostics and observability. */
    message: z.string().min(1),
  })
  .strict();
export type UnresolvedReference = z.infer<typeof UnresolvedReferenceSchema>;
