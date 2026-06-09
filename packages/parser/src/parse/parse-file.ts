import { type Descriptor, formatSymbolId, type SymbolId, type SymbolIdentity } from '@toopo/core';
import { type Language, type Tree, Parser as TreeSitterParser } from 'web-tree-sitter';
import { loadGrammar } from '../engine/grammar-cache.js';
import { compileQuery } from '../engine/query-cache.js';
import { ensureRuntime } from '../engine/runtime.js';
import type { ExtractContext, LanguagePlugin } from '../plugin/language-plugin.js';
import { resolvePlugin } from '../plugin/registry.js';
import type { ParseResult } from '../result.js';
import { assembleAnalyzed } from './assemble.js';
import { hashContent } from './content-hash.js';
import { degradedResult } from './degradation.js';
import { locate } from './locate.js';
import { fileIdentity } from './mint.js';

const UTF8 = new TextDecoder('utf-8');

/** One file to parse: its repo-relative path and its raw bytes. */
export interface ParseFileInput {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** A configured parser over a fixed set of injected language plugins. */
export interface GraphParser {
  parseFile(input: ParseFileInput): Promise<ParseResult>;
}

/**
 * Create a parser from a set of language plugins (ADR-0016). The parser is
 * language-agnostic: it never imports a `lang-*` package — plugins are injected
 * here — and owns only the mechanics (WASM lifecycle, hashing, identity,
 * ordering, degradation).
 */
export function createParser(plugins: readonly LanguagePlugin[]): GraphParser {
  return {
    parseFile: (input) => parseFile(plugins, input),
  };
}

async function parseFile(
  plugins: readonly LanguagePlugin[],
  input: ParseFileInput,
): Promise<ParseResult> {
  const contentHash = hashContent(input.bytes);
  const identity = fileIdentity(input.path);
  const fileId = formatSymbolId(identity);

  const plugin = resolvePlugin(plugins, { path: input.path });
  if (plugin === undefined) {
    return degradedResult({
      fileId,
      path: input.path,
      contentHash,
      analysis: {
        status: 'unsupported-language',
        reason: `No language plugin matches "${input.path}".`,
      },
    });
  }

  await ensureRuntime();
  const language = await loadGrammar(plugin.grammar);
  const source = UTF8.decode(input.bytes);

  const tsParser = new TreeSitterParser();
  tsParser.setLanguage(language);
  const tree = tsParser.parse(source);
  try {
    if (tree === null) {
      return degradedResult({
        fileId,
        path: input.path,
        contentHash,
        analysis: { status: 'parse-error', reason: `${plugin.id}: parser produced no tree.` },
      });
    }
    if (tree.rootNode.hasError) {
      return degradedResult({
        fileId,
        path: input.path,
        contentHash,
        analysis: { status: 'parse-error', reason: `${plugin.id}: source contains syntax errors.` },
      });
    }
    const ctx = buildContext(plugin, language, tree, source, input.path, fileId, identity);
    const fragment = plugin.extract(ctx);
    return assembleAnalyzed({ fileId, path: input.path, contentHash, fragment });
  } finally {
    tree?.delete();
    tsParser.delete();
  }
}

function buildContext(
  plugin: LanguagePlugin,
  language: Language,
  tree: Tree,
  source: string,
  filePath: string,
  fileId: SymbolId,
  identity: SymbolIdentity,
): ExtractContext {
  return {
    tree,
    source,
    filePath,
    fileId,
    fileIdentity: identity,
    query: (scm) => compileQuery(plugin.grammar.id, language, scm),
    locate,
    childId: (descriptors) => composeChildId(identity, descriptors),
  };
}

function composeChildId(identity: SymbolIdentity, descriptors: readonly Descriptor[]): SymbolId {
  return formatSymbolId({
    ...identity,
    descriptors: [...identity.descriptors, ...descriptors],
  });
}
