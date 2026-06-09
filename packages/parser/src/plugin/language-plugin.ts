import type { Descriptor, Edge, Location, Node, SymbolId, SymbolIdentity } from '@toopo/core';
import type { Query, Node as SyntaxNode, Tree } from 'web-tree-sitter';
import type { ExternalImport, LocalExport, ReExport, UnresolvedImport } from '../result.js';

/**
 * The language-plugin contract (ADR-0016) — the extensibility keystone. The
 * PARSER owns mechanics (WASM lifecycle, identity minting, location mapping,
 * query compilation, hashing, ordering, degradation); the PLUGIN owns ALL
 * language semantics (which grammar, which queries, how captures map to core
 * nodes/edges). The parser never knows what a "component" is — that lives only
 * in the plugin — which is how a new language is a new plugin with ZERO parser
 * or core change, and how we avoid the universal-abstract-AST failure mode
 * ADR-0015 calls out.
 */

/** The minimal file descriptor a plugin needs to decide if it applies. */
export interface FileRef {
  readonly path: string;
}

/**
 * How a plugin provides its grammar. The plugin returns the compiled `.wasm`
 * BYTES (it owns its vendored grammar via its own path resolution), so the
 * parser stays filesystem- and bundler-agnostic and grammar provenance lives
 * wholly inside the `lang-*` package. `id` keys the parser's grammar cache.
 */
export interface GrammarSource {
  readonly id: string;
  load(): Promise<Uint8Array>;
}

/**
 * Parser-provided primitives handed to a plugin's `extract`. They centralize
 * the mechanical concerns that MUST stay identical across languages — identity
 * minting, location mapping, query compilation — so no two plugins can drift on
 * them (ADR-0016 determinism).
 */
export interface ExtractContext {
  readonly tree: Tree;
  readonly source: string;
  readonly filePath: string;
  /** Stable id of the file node, encoded (ADR-0015 §4). */
  readonly fileId: SymbolId;
  /** Structured form of `fileId`, for composing contained-symbol ids. */
  readonly fileIdentity: SymbolIdentity;
  /** Compile (and cache) a tree-sitter query against this file's grammar. */
  query(scm: string): Query;
  /** Map a tree-sitter node to a core `Location` (native coords, no conversion). */
  locate(node: SyntaxNode): Location;
  /** Mint the id of a symbol contained by this file, by appending descriptors. */
  childId(descriptors: readonly Descriptor[]): SymbolId;
}

/**
 * What a plugin returns for one file: the core nodes/edges the file DECLARES,
 * plus the structured `unresolved` imports for the Resolve pass (ADR-0016
 * Fork 4). Edges may legitimately target external symbols that have no
 * in-fragment node (e.g. an imported `react` binding) — the parser's boundary
 * validation checks shapes only and never rejects such targets as dangling.
 */
export interface GraphFragment {
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
  readonly unresolved: readonly UnresolvedImport[];
  readonly exports: readonly LocalExport[];
  readonly reExports: readonly ReExport[];
  readonly externalImports: readonly ExternalImport[];
}

/** A language implementation injected into the parser at runtime. */
export interface LanguagePlugin {
  readonly id: string;
  readonly grammar: GrammarSource;
  matches(file: FileRef): boolean;
  extract(ctx: ExtractContext): GraphFragment;
}
