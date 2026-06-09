import { describe, expect, it } from 'vitest';
import { composeCallSiteId } from './call-site-id';
import { parseSymbolId } from './symbol-id';

const enclosing = 'src/Button#render.';

describe('composeCallSiteId', () => {
  it('derives a parseable id from enclosing symbol, callee and ordinal', () => {
    const id = composeCallSiteId({
      enclosingSymbolId: enclosing,
      calleeReference: 'useState',
      ordinal: 0,
    });
    const identity = parseSymbolId(id);
    expect(identity.descriptors).toHaveLength(4);
    const last = identity.descriptors.at(-1);
    expect(last?.suffix).toBe('meta');
    expect(last?.name).toBe('useState#0');
  });

  it('is deterministic for identical inputs', () => {
    const input = { enclosingSymbolId: enclosing, calleeReference: 'fn', ordinal: 2 };
    expect(composeCallSiteId(input)).toBe(composeCallSiteId(input));
  });

  it('distinguishes ordinals among identical calls', () => {
    const a = composeCallSiteId({
      enclosingSymbolId: enclosing,
      calleeReference: 'fn',
      ordinal: 0,
    });
    const b = composeCallSiteId({
      enclosingSymbolId: enclosing,
      calleeReference: 'fn',
      ordinal: 1,
    });
    expect(a).not.toBe(b);
  });

  it('rejects a negative ordinal', () => {
    expect(() =>
      composeCallSiteId({ enclosingSymbolId: enclosing, calleeReference: 'fn', ordinal: -1 }),
    ).toThrow();
  });

  it('rejects an empty enclosing id', () => {
    expect(() =>
      composeCallSiteId({ enclosingSymbolId: '', calleeReference: 'fn', ordinal: 0 }),
    ).toThrow();
  });
});
