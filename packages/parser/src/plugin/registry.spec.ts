import { describe, expect, it } from 'vitest';
import type { LanguagePlugin } from './language-plugin';
import { resolvePlugin } from './registry';

function stub(id: string, extension: string): LanguagePlugin {
  return {
    id,
    grammar: { id, load: () => Promise.resolve(new Uint8Array()) },
    matches: (file) => file.path.endsWith(extension),
    extract: () => ({ nodes: [], edges: [], unresolved: [] }),
  };
}

describe('resolvePlugin', () => {
  it('returns the first plugin whose matches() is true (deterministic by order)', () => {
    const first = stub('first', '.tsx');
    const second = stub('second', '.tsx');
    expect(resolvePlugin([first, second], { path: 'x.tsx' })).toBe(first);
  });

  it('returns undefined when no plugin matches', () => {
    expect(resolvePlugin([stub('only', '.tsx')], { path: 'x.py' })).toBeUndefined();
  });

  it('returns undefined for an empty plugin set', () => {
    expect(resolvePlugin([], { path: 'x.tsx' })).toBeUndefined();
  });
});
