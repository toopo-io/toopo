import type { GraphDocument } from '@toopo/core';
import { GraphDocumentSchema, LocationSchema } from '@toopo/core';
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
 * A bare (external-package) import that carries a SUBPATH (`@toopo/ui/components/x`).
 * Parsing is lossless (ADR-0016): the subpath is first-class source information,
 * so it is preserved here rather than discarded when the package coordinate is
 * derived. The parser still emits the provisional external `imports` edge (keyed
 * by package coordinate + name); this record lets the Resolve pass recover the
 * subpath and re-resolve a WORKSPACE package's subpath import to its source
 * symbol via that package's `exports` map (Fix C2). `subpath` is the specifier
 * past the package name (`components/x`), empty for a bare `@toopo/ui`.
 * Pipeline data, NOT part of the persisted graph model.
 */
export const ExternalImportSchema = z
  .object({
    importerFileId: z.string().min(1),
    packageName: z.string().min(1),
    subpath: z.string(),
    imported: z.array(ImportedBindingSchema),
  })
  .strict();
export type ExternalImport = z.infer<typeof ExternalImportSchema>;

/**
 * The output of parsing one file (ADR-0016 file-level incremental flow): the
 * `@toopo/core` graph fragment for the file, plus the structured pipeline data
 * handed to the Resolve pass — `unresolved` imports, locally-defined `exports`,
 * `reExports`, and the subpath-carrying `externalImports`. The pipeline data is
 * deliberately NOT part of the persisted graph model, so it requires no
 * `@toopo/core` change.
 */
export interface ParseResult {
  readonly document: GraphDocument;
  readonly unresolved: readonly UnresolvedImport[];
  readonly exports: readonly LocalExport[];
  readonly reExports: readonly ReExport[];
  readonly externalImports: readonly ExternalImport[];
}

/**
 * Validation schema for a {@link ParseResult} — the boundary (ADR-0006) the
 * content-hash parse cache (ADR-0025 Decision 3) revalidates every fragment it
 * reads back, so a corrupt or truncated cache row can never re-enter the pipeline
 * as a valid fragment (it is rejected and the file is re-parsed).
 */
export const ParseResultSchema = z
  .object({
    document: GraphDocumentSchema,
    unresolved: z.array(UnresolvedImportSchema),
    exports: z.array(LocalExportSchema),
    reExports: z.array(ReExportSchema),
    externalImports: z.array(ExternalImportSchema),
  })
  .strict();

/**
 * The parse-output format version. Bump on ANY change to the {@link ParseResult}
 * shape or the parser's extraction, so the cache key the worker derives changes and
 * every prior cached fragment becomes unreachable — a fresh parse, never a stale
 * hit in an old format (ADR-0025 Decision 3). The content hash alone is over file
 * BYTES and would not capture a parser change; this version closes that gap.
 */
export const PARSE_RESULT_VERSION = 1;

/** Serialize a parse fragment for the cache (deterministic JSON of validated data). */
export function serializeParseResult(result: ParseResult): string {
  return JSON.stringify(result);
}

/** Parse + revalidate a cached fragment; throws (caught by the caller as a miss)
 *  if the stored blob is corrupt or in a no-longer-valid shape. */
export function deserializeParseResult(json: string): ParseResult {
  return ParseResultSchema.parse(JSON.parse(json));
}
