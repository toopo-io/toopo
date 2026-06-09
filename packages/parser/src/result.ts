import type { GraphDocument } from '@toopo/core';
import { LocationSchema } from '@toopo/core';
import { z } from 'zod';

/**
 * One binding pulled in by an import statement. `name` is the EXPORTED name in
 * the source module (`default` for a default import, `*` for a namespace
 * import); `localName` is the in-file alias. `typeOnly` marks a per-specifier
 * `import { type X }`.
 */
export const ImportedBindingSchema = z
  .object({
    name: z.string().min(1),
    localName: z.string().min(1),
    kind: z.enum(['named', 'default', 'namespace']),
    typeOnly: z.boolean(),
  })
  .strict();
export type ImportedBinding = z.infer<typeof ImportedBindingSchema>;

/**
 * A relative/alias import the parser cannot bind on its own (ADR-0016 Fork 4):
 * resolving `./Button` or `@/components/X` needs the cross-file view that only
 * the Resolve pass has. The parser emits NO fabricated edge for it — it carries
 * the structured facts the resolver needs instead: the importing file's id and
 * path, the module specifier, every imported binding, and a whole-statement
 * `import type` flag. External (bare-specifier) imports do NOT appear here —
 * those are emitted as deterministic edges during parse.
 */
export const UnresolvedImportSchema = z
  .object({
    importerFileId: z.string().min(1),
    importerPath: z.string().min(1),
    specifier: z.string().min(1),
    imported: z.array(ImportedBindingSchema),
    typeOnly: z.boolean(),
    location: LocationSchema,
  })
  .strict();
export type UnresolvedImport = z.infer<typeof UnresolvedImportSchema>;

/**
 * One name a file exports that binds to a symbol it DEFINES locally (ADR-0016
 * export resolution). `exportedName` is the name importers use — `default` for a
 * default export, or the renamed name for `export { Foo as Bar }`; `symbolId` is
 * the defining symbol. The parse pass also emits a deterministic `exports` edge
 * for the same fact, but an edge cannot carry the exported NAME, so it cannot
 * distinguish a `default` export from a same-named named export. This record
 * carries that name, so the Resolve pass can key its export index precisely and
 * never conflate the two (the trust principle — a false resolution is the
 * cardinal sin). Pipeline data, NOT part of the persisted graph model.
 */
export const LocalExportSchema = z
  .object({
    exporterFileId: z.string().min(1),
    exportedName: z.string().min(1),
    symbolId: z.string().min(1),
    typeOnly: z.boolean(),
  })
  .strict();
export type LocalExport = z.infer<typeof LocalExportSchema>;

/** One binding carried by a re-export: `name` is the exported name in the SOURCE
 * module (`*` for a namespace re-export, `default` for a default re-export);
 * `exportedAs` is the name THIS module re-exports it under. */
export const ReExportBindingSchema = z
  .object({
    name: z.string().min(1),
    exportedAs: z.string().min(1),
    typeOnly: z.boolean(),
  })
  .strict();
export type ReExportBinding = z.infer<typeof ReExportBindingSchema>;

/**
 * One re-export statement (`export … from './m'`) a file declares (ADR-0016
 * barrel resolution). Its target lives in another module, so — exactly like an
 * `UnresolvedImport` — the parser emits NO fabricated edge and hands the
 * structured facts to the Resolve pass instead:
 *   - `named`     — `export { a, b as c } from './m'` → one binding per name.
 *   - `namespace` — `export * as ns from './m'` → a single `{ name: '*', … }`.
 *   - `star`      — `export * from './m'` → re-exports every name (no bindings).
 * Pipeline data, NOT part of the persisted graph model.
 */
export const ReExportSchema = z
  .object({
    exporterFileId: z.string().min(1),
    exporterPath: z.string().min(1),
    specifier: z.string().min(1),
    kind: z.enum(['named', 'namespace', 'star']),
    bindings: z.array(ReExportBindingSchema),
    typeOnly: z.boolean(),
  })
  .strict();
export type ReExport = z.infer<typeof ReExportSchema>;

/**
 * The output of parsing one file (ADR-0016 file-level incremental flow): the
 * `@toopo/core` graph fragment for the file, plus the structured pipeline data
 * handed to the Resolve pass — `unresolved` imports, locally-defined `exports`,
 * and `reExports`. The pipeline data is deliberately NOT part of the persisted
 * graph model, so it requires no `@toopo/core` change.
 */
export interface ParseResult {
  readonly document: GraphDocument;
  readonly unresolved: readonly UnresolvedImport[];
  readonly exports: readonly LocalExport[];
  readonly reExports: readonly ReExport[];
}
