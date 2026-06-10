import { describe, expect, it } from 'vitest';
import type { SymbolIdentity } from './symbol-id';
import { formatSymbolId, parseSymbolId } from './symbol-id';

const CORPUS: ReadonlyArray<{ readonly label: string; readonly identity: SymbolIdentity }> = [
  {
    label: 'a single namespace',
    identity: { descriptors: [{ name: 'src', suffix: 'namespace' }] },
  },
  {
    label: 'a nested descriptor path',
    identity: {
      descriptors: [
        { name: 'src', suffix: 'namespace' },
        { name: 'Button', suffix: 'type' },
        { name: 'render', suffix: 'term' },
      ],
    },
  },
  {
    label: 'a method with a disambiguator',
    identity: {
      descriptors: [{ name: 'overloaded', suffix: 'method', disambiguator: 'b' }],
    },
  },
  {
    label: 'a method without a disambiguator',
    identity: { descriptors: [{ name: 'fn', suffix: 'method' }] },
  },
  {
    label: 'parameters and type-parameters',
    identity: {
      descriptors: [
        { name: 'Map', suffix: 'type' },
        { name: 'K', suffix: 'type-parameter' },
        { name: 'value', suffix: 'parameter' },
      ],
    },
  },
  {
    label: 'meta and macro suffixes',
    identity: {
      descriptors: [
        { name: 'config', suffix: 'meta' },
        { name: 'derive', suffix: 'macro' },
      ],
    },
  },
  {
    label: 'a name needing backtick escaping',
    identity: { descriptors: [{ name: 'has space', suffix: 'term' }] },
  },
  {
    label: 'a name containing a backtick',
    identity: { descriptors: [{ name: 'a`b', suffix: 'type' }] },
  },
  {
    label: 'a unicode name',
    identity: { descriptors: [{ name: 'café', suffix: 'term' }] },
  },
  {
    label: 'a name with a suffix-like character',
    identity: { descriptors: [{ name: 'a/b#c.d', suffix: 'type' }] },
  },
  {
    label: 'a local binding under an enclosing scope',
    identity: {
      descriptors: [
        { name: 'outer', suffix: 'term' },
        { name: 'total', suffix: 'local' },
      ],
    },
  },
  {
    label: 'a shadowing local with a disambiguator',
    identity: {
      descriptors: [
        { name: 'outer', suffix: 'term' },
        { name: 'x', suffix: 'local', disambiguator: '1' },
      ],
    },
  },
  {
    label: 'a parameter of a nested local function',
    identity: {
      descriptors: [
        { name: 'outer', suffix: 'term' },
        { name: 'inner', suffix: 'local' },
        { name: 'z', suffix: 'parameter' },
      ],
    },
  },
  {
    label: 'an external reference (manager + name only)',
    identity: {
      package: { manager: 'npm', name: 'react' },
      descriptors: [
        { name: 'react', suffix: 'namespace' },
        { name: 'useState', suffix: 'term' },
      ],
    },
  },
  {
    label: 'an external reference with a spaced coordinate',
    identity: {
      package: { manager: 'my manager', name: 'scoped pkg' },
      descriptors: [{ name: 'X', suffix: 'type' }],
    },
  },
];

describe('formatSymbolId / parseSymbolId round-trip', () => {
  for (const { label, identity } of CORPUS) {
    it(`round-trips ${label}`, () => {
      const encoded = formatSymbolId(identity);
      const decoded = parseSymbolId(encoded);
      expect(decoded).toEqual(identity);
      // string → struct → string is also stable.
      expect(formatSymbolId(decoded)).toBe(encoded);
    });
  }
});

describe('formatSymbolId', () => {
  it('encodes simple identifiers without escaping', () => {
    expect(formatSymbolId({ descriptors: [{ name: 'Button', suffix: 'type' }] })).toBe('Button#');
  });

  it('backtick-wraps and doubles embedded backticks', () => {
    expect(formatSymbolId({ descriptors: [{ name: 'a`b', suffix: 'term' }] })).toBe('`a``b`.');
  });

  it('encodes a local binding with the doubled-tilde sigil', () => {
    expect(formatSymbolId({ descriptors: [{ name: 'total', suffix: 'local' }] })).toBe('total~~');
  });

  it('encodes a shadowing local with its disambiguator', () => {
    expect(
      formatSymbolId({ descriptors: [{ name: 'x', suffix: 'local', disambiguator: '1' }] }),
    ).toBe('x~1~');
  });

  it('prefixes external references with the package coordinate', () => {
    const id = formatSymbolId({
      package: { manager: 'npm', name: 'react' },
      descriptors: [{ name: 'useState', suffix: 'term' }],
    });
    expect(id).toBe('npm react useState.');
  });

  it('rejects an identity with no descriptors', () => {
    expect(() => formatSymbolId({ descriptors: [] })).toThrow();
  });
});

describe('parseSymbolId', () => {
  it('throws on an empty id', () => {
    expect(() => parseSymbolId('')).toThrow();
  });

  it('throws on an unknown suffix', () => {
    expect(() => parseSymbolId('Button')).toThrow();
  });

  it('throws on an unterminated escaped identifier', () => {
    expect(() => parseSymbolId('`unterminated#')).toThrow();
  });

  it('throws on a malformed method descriptor', () => {
    expect(() => parseSymbolId('fn(a)')).toThrow();
  });

  it('throws on a malformed segment count', () => {
    expect(() => parseSymbolId('one two')).toThrow();
  });

  it('throws on an unterminated parameter descriptor', () => {
    expect(() => parseSymbolId('(value')).toThrow();
  });

  it('throws on an unterminated type-parameter descriptor', () => {
    expect(() => parseSymbolId('[K')).toThrow();
  });

  it('throws on an unterminated local descriptor', () => {
    expect(() => parseSymbolId('outer.x~1')).toThrow();
  });

  it('throws when an identifier is expected but a suffix char appears', () => {
    expect(() => parseSymbolId('#')).toThrow();
  });

  it('parses standalone parameter and type-parameter descriptors', () => {
    expect(parseSymbolId('(value)')).toEqual({
      descriptors: [{ name: 'value', suffix: 'parameter' }],
    });
    expect(parseSymbolId('[K]')).toEqual({
      descriptors: [{ name: 'K', suffix: 'type-parameter' }],
    });
  });
});
