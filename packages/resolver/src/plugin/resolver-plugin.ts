import type {
  CallSitePayloadArgument,
  Confidence,
  EdgeKind,
  PackageCoordinate,
  SymbolId,
} from '@toopo/core';
import type { FileRef, ReExport } from '@toopo/parser';

/**
 * The resolver-plugin contract (ADR-0016 Resolve pass) — the extensibility
 * keystone of the cross-file binding pass, mirroring how `LanguagePlugin`
 * splits the Parse pass. The ENGINE (`packages/resolver`) owns the mechanics
 * (aggregation, the file/export indices, work-list correlation, edge minting,
 * determinism, diagnostics); the PLUGIN owns ALL language semantics (how a
 * specifier maps to a file, how an exported name resolves to a symbol, how a
 * callee maps to an imported binding). The engine never knows what a "barrel"
 * or a "tsconfig path" is — that lives only in the plugin — which is how a new
 * language is a new plugin with ZERO engine or core change.
 *
 * The trust guarantee (ADR-0015 §8) is structural: the engine NEVER upgrades a
 * plugin's verdict. A `deterministic` edge can only originate from a plugin
 * returning a `deterministic` {@link Certainty}; an `inferred` outcome flows
 * straight through with its confidence intact.
 */

/**
 * Certainty of a resolution outcome — the same `deterministic | inferred`
 * discriminator core's `withResolution` carries (ADR-0015 §8), so a plugin
 * verdict maps 1:1 onto the edge the engine emits. `deterministic` carries no
 * confidence; `inferred` requires one.
 */
export type Certainty =
  | { readonly resolution: 'deterministic' }
  | { readonly resolution: 'inferred'; readonly confidence: Confidence };

/** A module specifier the resolver must bind (relative / alias / workspace). */
export interface ModuleRequest {
  readonly specifier: string;
  readonly importerPath: string;
  readonly importerFileId: SymbolId;
  readonly typeOnly: boolean;
}

/** A request to resolve one exported name within an already module-resolved file. */
export interface ExportRequest {
  readonly fileId: SymbolId;
  readonly exportedName: string;
  readonly typeOnly: boolean;
}

/**
 * One tsconfig `paths` rule, with repo-relative targets (ADR-0016 Fork 2). The
 * `pattern` is the path key (`@/*`, `@app`); `targets` are the fallback
 * substitutions with the `*` capture, already resolved against `baseUrl` by the
 * caller — the resolver never reads tsconfig from disk (the fs-free guarantee).
 */
export interface AliasRule {
  readonly pattern: string;
  readonly targets: readonly string[];
}

/** One subpath the package's `exports` map publishes (ADR-0016 Fix C2): the
 * import subpath (`components/button`, past the package name) mapped to the
 * repo-relative SOURCE file that backs it (`packages/ui/src/components/button.tsx`).
 * Resolved from the package's built `exports` target by the caller. */
export interface SubpathExport {
  readonly subpath: string;
  readonly entry: string;
}

/** One workspace-internal package (ADR-0016 Fork 2b), so a bare import of its
 * name (or a published subpath) resolves to an internal symbol, not an external
 * coordinate. `entry` is the package's main source entry (the `.` export);
 * `subpathExports` are its other published subpaths. At least one is present.
 * Supplied by the caller; the resolver never reads disk. */
export interface WorkspacePackage {
  readonly name: string;
  readonly entry?: string;
  readonly subpathExports?: readonly SubpathExport[];
}

/**
 * Project metadata the resolver needs that does NOT come from the parsed files —
 * tsconfig path aliases and workspace packages. It enters ONLY through this
 * model (built by the caller from raw config content), never by the resolver
 * touching the filesystem, which keeps the Resolve pass pure and deterministic.
 */
export interface ProjectModel {
  readonly aliases: readonly AliasRule[];
  readonly workspacePackages: readonly WorkspacePackage[];
}

/**
 * Engine-built read model of the project's parsed file universe (ADR-0016: the
 * resolver is filesystem-free — "does `./Button.tsx` exist?" means "is it in
 * the parsed set?"). The plugin drives the per-language probing (extensions,
 * `/index`, directory) against this lookup; the engine owns only the lookup.
 */
export interface ModuleIndex {
  /** The stable id of a known repo-relative file path, or undefined if unknown. */
  fileId(repoRelativePath: string): SymbolId | undefined;
}

/**
 * Engine-built read model of per-file export facts (ADR-0016 barrel
 * resolution). Sourced from the parse-side `exports` edges and re-export
 * records; the plugin follows chains through it to a defining symbol.
 */
export interface ExportIndex {
  /** A locally-defined export of `fileId` by its exported name, if any. */
  localExport(fileId: SymbolId, exportedName: string): SymbolId | undefined;
  /** The re-export statements (`export … from`) the file declares (barrels). */
  reExports(fileId: SymbolId): readonly ReExport[];
}

/**
 * Where a module specifier resolves to. `ambiguous` (≥2 equally-plausible
 * targets with no principled tiebreak) yields NO edge plus a diagnostic — the
 * engine never picks one of equals, even as `inferred`. `unresolved` means the
 * specifier matched no known file at all.
 */
export type ModuleResolution =
  | { readonly status: 'internal'; readonly fileId: SymbolId; readonly certainty: Certainty }
  | { readonly status: 'external'; readonly coordinate: PackageCoordinate }
  | { readonly status: 'ambiguous'; readonly candidates: readonly SymbolId[] }
  | { readonly status: 'unresolved'; readonly reason: string };

/**
 * Where an exported name resolves to within a module-resolved file (single hop).
 * `re-export` is a redirect through a barrel (`export … from`): the engine
 * resolves the new module and recurses, accumulating certainty and detecting
 * cycles, so the plugin stays single-hop. `multi-star` defers a name reaching
 * two or more `export *` barrels to the engine, which alone holds the module
 * index needed to probe each star target for the name (the plugin stays
 * filesystem-free): exactly one provider resolves deterministically (proven),
 * two or more is `ambiguous`, none continues the tail. `external` carries the
 * package coordinate and the still-external name; `ambiguous`/`unresolved`
 * follow the same honesty rule as {@link ModuleResolution}.
 */
export type ExportResolution =
  | { readonly status: 'symbol'; readonly symbolId: SymbolId; readonly certainty: Certainty }
  | {
      readonly status: 're-export';
      readonly specifier: string;
      readonly importerPath: string;
      readonly exportedName: string;
      readonly certainty: Certainty;
    }
  | {
      readonly status: 'multi-star';
      readonly specifiers: readonly string[];
      readonly importerPath: string;
      readonly exportedName: string;
    }
  | { readonly status: 'external'; readonly coordinate: PackageCoordinate; readonly name: string }
  | { readonly status: 'ambiguous'; readonly candidates: readonly SymbolId[] }
  | { readonly status: 'unresolved'; readonly reason: string };

/** One of an importer file's resolved imports: the bound symbol and its certainty. */
export interface ResolvedImport {
  readonly symbolId: SymbolId;
  readonly certainty: Certainty;
}

/**
 * The file's namespace imports (`import * as NS from './mod'`), resolvable to the
 * member they name (ADR-0016 Fork 4). A member access `NS.foo` on a namespace
 * import IS the module's exported `foo` by language semantics, so the engine
 * resolves it through the same export chain a named import uses — `NS.foo` binds
 * exactly as `import { foo }` would, at the same certainty. The PLUGIN owns the
 * callee syntax (how `NS.foo` splits into root + member); the ENGINE owns the
 * export-chain mechanics behind {@link resolveMember}. Only INTERNAL namespace
 * modules resolve; an external coordinate stays unmodelled (deferred), and an
 * unresolvable member yields `null` — no edge, never a guess (the trust principle).
 */
export interface NamespaceImports {
  /** How many namespace imports the file has — zero lets the engine skip call-site work. */
  readonly size: number;
  /**
   * Resolve `memberName` accessed on the namespace bound to `localName`, or `null`
   * when `localName` is not a (resolvable, internal) namespace import or the member
   * names no resolvable export.
   */
  resolveMember(localName: string, memberName: string): ResolvedImport | null;
}

/** A deferred call-site the engine asks a plugin to bind across files. `subKind`
 * is the call-site's own parse-time refinement (the plugin interprets it — e.g.
 * `react:element` marks a render); `payload` is its actual args/props. */
export interface CallSiteBinding {
  readonly callSiteId: SymbolId;
  readonly callee: string;
  readonly subKind: string | undefined;
  readonly payload: readonly CallSitePayloadArgument[];
}

/** A child symbol declared by a target symbol (a parameter/prop), exposed to the
 * plugin so it can bind a payload to the receiving declaration BY ITS OWN RULES
 * (e.g. React binds props by name). The engine surfaces children agnostically;
 * the plugin decides which are bindable via their language-namespaced `subKind`. */
export interface DeclaredChildView {
  readonly id: SymbolId;
  readonly name: string;
  readonly subKind: string | undefined;
}

/** Engine-built read model of a symbol's declared interface (ADR-0015 §6). */
export interface SymbolView {
  declaredChildren(symbolId: SymbolId): readonly DeclaredChildView[];
}

/**
 * A cross-file edge a plugin asks the engine to mint. It carries the language-
 * namespaced `subKind` and `rule` the plugin chose, plus a {@link Certainty}.
 * The engine maps `certainty` onto the core edge's `deterministic | inferred`
 * 1:1 — it cannot upgrade it (ADR-0015 §8, the trust guarantee).
 */
export interface ResolvedEdge {
  readonly kind: EdgeKind;
  readonly sourceId: SymbolId;
  readonly targetId: SymbolId;
  readonly rule: string;
  readonly subKind?: string;
  readonly certainty: Certainty;
}

/**
 * A language's resolution implementation, injected into the resolver at runtime.
 * `bindCallSite` is where ALL call-site binding semantics live — how a callee
 * maps to an imported name (exact identifier; `member-root` like `Form.Item`; or
 * a namespace member like `NS.foo`, resolved through {@link NamespaceImports}),
 * whether a render or a call edge is emitted, and how a payload binds to the
 * receiver's declared interface — because every one of those carries language-
 * specific subKinds the agnostic engine must not know. It returns descriptors;
 * the engine mints, dedupes, orders, and never upgrades their certainty.
 */
export interface ResolverPlugin {
  readonly id: string;
  matches(file: FileRef): boolean;
  resolveModule(
    request: ModuleRequest,
    index: ModuleIndex,
    project: ProjectModel,
  ): ModuleResolution;
  resolveExport(request: ExportRequest, index: ExportIndex): ExportResolution;
  bindCallSite(
    callSite: CallSiteBinding,
    resolvedImports: ReadonlyMap<string, ResolvedImport>,
    namespaceImports: NamespaceImports,
    symbols: SymbolView,
  ): readonly ResolvedEdge[];
}
