import { describe, expect, it } from 'vitest';
import { buildResolveEdge, combineCertainty, mintEdge } from './mint.js';

describe('certainty combination', () => {
  it('stays deterministic only when both steps are deterministic', () => {
    expect(
      combineCertainty({ resolution: 'deterministic' }, { resolution: 'deterministic' }),
    ).toEqual({
      resolution: 'deterministic',
    });
  });

  it('degrades to inferred at the lower confidence when either step is inferred', () => {
    expect(
      combineCertainty(
        { resolution: 'deterministic' },
        { resolution: 'inferred', confidence: 'medium' },
      ),
    ).toEqual({ resolution: 'inferred', confidence: 'medium' });

    expect(
      combineCertainty(
        { resolution: 'inferred', confidence: 'low' },
        { resolution: 'inferred', confidence: 'high' },
      ),
    ).toEqual({ resolution: 'inferred', confidence: 'low' });
  });
});

describe('edge minting', () => {
  it('maps a deterministic certainty to a deterministic edge with no confidence', () => {
    const edge = buildResolveEdge('imports', 'A.', 'B.', 'resolve/import', {
      resolution: 'deterministic',
    });
    expect(edge).toEqual({
      kind: 'imports',
      sourceId: 'A.',
      targetId: 'B.',
      provenance: { pass: 'resolve', rule: 'resolve/import' },
      resolution: 'deterministic',
    });
  });

  it('carries confidence and subKind on an inferred descriptor', () => {
    const edge = mintEdge({
      kind: 'calls',
      sourceId: 'cs.',
      targetId: 'T.',
      rule: 'react/renders-import',
      subKind: 'react:renders',
      certainty: { resolution: 'inferred', confidence: 'high' },
    });
    expect(edge).toEqual({
      kind: 'calls',
      sourceId: 'cs.',
      targetId: 'T.',
      subKind: 'react:renders',
      provenance: { pass: 'resolve', rule: 'react/renders-import' },
      resolution: 'inferred',
      confidence: 'high',
    });
  });
});
