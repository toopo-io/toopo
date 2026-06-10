import { z } from 'zod';
import { UNRESOLVED_REFERENCE_CODES } from '../constants.js';

/**
 * The persisted, honest tail of the Resolve pass (ADR-0016 amendment): one
 * import/usage that could NOT be bound to a precise symbol, kept as a first-class
 * sibling of the graph rather than dropped. It is NOT a graph node or edge — a
 * fabricated edge would assert a dependency we cannot prove (the trust principle)
 * — but it must be queryable, so a later "unused"/"cycle" view never reads a
 * resolution gap as genuine absence (the cardinal false positive).
 *
 * For an `*-export` code the module resolved, so `targetFileId` is the resolved
 * file and `name` is the export that did not bind — enough to ask "does this file
 * have an unresolved inbound usage of this name?". For a `*-module` code the
 * specifier matched no/ambiguous file, so neither is known (the target is outside
 * the graph and cannot be a project symbol marked unused).
 */
export const UnresolvedReferenceCodeSchema = z.enum(UNRESOLVED_REFERENCE_CODES);
export type UnresolvedReferenceCode = z.infer<typeof UnresolvedReferenceCodeSchema>;

export const UnresolvedReferenceSchema = z
  .object({
    /** Why the binding failed (module vs export, unresolved vs ambiguous). */
    code: UnresolvedReferenceCodeSchema,
    /** The id of the file whose import/usage could not be bound. */
    importerFileId: z.string().min(1),
    /** The module specifier as written in the importer. */
    specifier: z.string().min(1),
    /** For an `*-export` code, the resolved module's file id (the usage's target). */
    targetFileId: z.string().min(1).optional(),
    /** For an `*-export` code, the exported name that did not bind. */
    name: z.string().min(1).optional(),
    /** A human-readable reason, for diagnostics and observability. */
    message: z.string().min(1),
  })
  .strict();
export type UnresolvedReference = z.infer<typeof UnresolvedReferenceSchema>;
