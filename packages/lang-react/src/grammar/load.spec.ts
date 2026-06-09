import { describe, expect, it } from 'vitest';
import { loadTsxGrammar, loadTypescriptGrammar } from './load';

describe('grammar loaders', () => {
  it('reads the vendored tsx grammar as non-empty WASM bytes', async () => {
    const bytes = await loadTsxGrammar();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('reads the vendored typescript grammar as non-empty WASM bytes', async () => {
    const bytes = await loadTypescriptGrammar();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('vendors two distinct grammars (the .ts/.tsx split)', async () => {
    const [tsx, ts] = await Promise.all([loadTsxGrammar(), loadTypescriptGrammar()]);
    // Different grammars compile to different modules; a byte-identical pair would
    // mean the build emitted the wrong source for one of them.
    expect(Buffer.from(tsx).equals(Buffer.from(ts))).toBe(false);
  });
});
