import type { CallSitePayloadArgument } from '@toopo/core';
import type { CallSiteBinding, ResolvedImport, SymbolView } from '@toopo/resolver';
import { describe, expect, it } from 'vitest';
import { bindCallSite } from './bind-call-site';

const DETERMINISTIC = { resolution: 'deterministic' } as const;
const resolvedImports = new Map<string, ResolvedImport>([
  ['Button', { symbolId: 'B.', certainty: DETERMINISTIC }],
]);

const labelProp = { id: 'B.(label)', name: 'label', subKind: 'react:prop' };
const symbols: SymbolView = {
  declaredChildren: (symbolId) => (symbolId === 'B.' ? [labelProp] : []),
};

function named(name: string, value: string): CallSitePayloadArgument {
  return { ordinal: 0, name, passKind: 'named', value, resolution: 'deterministic' };
}

function site(overrides: Partial<CallSiteBinding>): CallSiteBinding {
  return {
    callSiteId: 'cs.',
    callee: 'Button',
    subKind: 'react:element',
    payload: [],
    ...overrides,
  };
}

describe('bindCallSite (React)', () => {
  it('binds an exact render callee with its prop, deterministically', () => {
    const edges = bindCallSite(
      site({ payload: [named('label', '"x"')] }),
      resolvedImports,
      symbols,
    );
    expect(edges).toEqual([
      {
        kind: 'calls',
        sourceId: 'cs.',
        targetId: 'B.',
        rule: 'react/renders-import',
        subKind: 'react:renders',
        certainty: DETERMINISTIC,
      },
      {
        kind: 'references',
        sourceId: 'cs.',
        targetId: 'B.(label)',
        rule: 'react/binds-prop',
        subKind: 'react:propBinding',
        certainty: DETERMINISTIC,
      },
    ]);
  });

  it('emits a plain call edge (no render subKind) for a non-render callee', () => {
    const edges = bindCallSite(site({ subKind: undefined, payload: [] }), resolvedImports, symbols);
    expect(edges).toEqual([
      {
        kind: 'calls',
        sourceId: 'cs.',
        targetId: 'B.',
        rule: 'react/calls-import',
        certainty: DETERMINISTIC,
      },
    ]);
  });

  it('never binds a spread or positional payload value (trust principle)', () => {
    const spread: CallSitePayloadArgument = {
      ordinal: 0,
      passKind: 'spread',
      value: 'rest',
      resolution: 'inferred',
      confidence: 'low',
    };
    const positional: CallSitePayloadArgument = {
      ordinal: 1,
      passKind: 'positional',
      value: '1',
      resolution: 'deterministic',
    };
    const edges = bindCallSite(site({ payload: [spread, positional] }), resolvedImports, symbols);
    expect(edges).toEqual([
      {
        kind: 'calls',
        sourceId: 'cs.',
        targetId: 'B.',
        rule: 'react/renders-import',
        subKind: 'react:renders',
        certainty: DETERMINISTIC,
      },
    ]);
  });

  it('does not bind a named prop that the receiver does not declare', () => {
    const edges = bindCallSite(
      site({ payload: [named('unknown', '"x"')] }),
      resolvedImports,
      symbols,
    );
    expect(edges).toEqual([
      {
        kind: 'calls',
        sourceId: 'cs.',
        targetId: 'B.',
        rule: 'react/renders-import',
        subKind: 'react:renders',
        certainty: DETERMINISTIC,
      },
    ]);
  });

  it('binds a member-root render (Form.Item → Form) as an inferred edge, never the member or its props', () => {
    const withForm = new Map<string, ResolvedImport>([
      ['Form', { symbolId: 'F.', certainty: DETERMINISTIC }],
    ]);
    expect(
      bindCallSite(
        site({ callee: 'Form.Item', payload: [named('label', '"x"')] }),
        withForm,
        symbols,
      ),
    ).toEqual([
      {
        kind: 'calls',
        sourceId: 'cs.',
        targetId: 'F.',
        rule: 'react/renders-member-root',
        subKind: 'react:memberRoot',
        certainty: { resolution: 'inferred', confidence: 'medium' },
      },
    ]);
  });

  it('binds a member-root call (obj.method) to its root, inferred, with no render subKind rule', () => {
    const withObj = new Map<string, ResolvedImport>([
      ['obj', { symbolId: 'O.', certainty: DETERMINISTIC }],
    ]);
    expect(
      bindCallSite(site({ callee: 'obj.method', subKind: undefined }), withObj, symbols),
    ).toEqual([
      {
        kind: 'calls',
        sourceId: 'cs.',
        targetId: 'O.',
        rule: 'react/calls-member-root',
        subKind: 'react:memberRoot',
        certainty: { resolution: 'inferred', confidence: 'medium' },
      },
    ]);
  });

  it('yields no edge for an empty callee or an unresolved import', () => {
    expect(bindCallSite(site({ callee: '' }), resolvedImports, symbols)).toEqual([]);
    expect(bindCallSite(site({ callee: 'Unknown' }), resolvedImports, symbols)).toEqual([]);
  });
});
