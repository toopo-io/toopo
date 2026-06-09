import { parseSymbolId } from '@toopo/core';
import { describe, expect, it } from 'vitest';
import { fileIdentity, fileSymbolId } from './mint';

describe('fileIdentity', () => {
  it('maps each path segment to a namespace descriptor', () => {
    expect(fileIdentity('src/Button.tsx')).toEqual({
      descriptors: [
        { name: 'src', suffix: 'namespace' },
        { name: 'Button.tsx', suffix: 'namespace' },
      ],
    });
  });

  it('normalizes windows separators and a leading ./ identically', () => {
    expect(fileIdentity('.\\src\\a\\b.ts')).toEqual(fileIdentity('src/a/b.ts'));
  });

  it('throws on a path with no segments', () => {
    expect(() => fileIdentity('')).toThrow();
    expect(() => fileIdentity('///')).toThrow();
  });
});

describe('fileSymbolId', () => {
  it('round-trips through the core descriptor codec', () => {
    const id = fileSymbolId('src/Button.tsx');
    expect(parseSymbolId(id)).toEqual(fileIdentity('src/Button.tsx'));
  });
});
