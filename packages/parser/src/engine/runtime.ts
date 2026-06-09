import { Parser } from 'web-tree-sitter';

/**
 * Idempotent one-time initialization of the web-tree-sitter WASM runtime
 * (ADR-0016 Fork 2). `Parser.init()` must run exactly once per process before
 * any grammar loads; this memoizes the in-flight promise so concurrent callers
 * and every subsequent file in a worker share a single init.
 */
let initialization: Promise<void> | undefined;

export function ensureRuntime(): Promise<void> {
  if (initialization === undefined) {
    initialization = Parser.init();
  }
  return initialization;
}
