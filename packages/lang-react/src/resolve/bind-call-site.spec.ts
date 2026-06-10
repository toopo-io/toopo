import type { CallSitePayloadArgument } from '@toopo/core';
import type {
  CallSiteBinding,
  NamespaceImports,
  ResolvedImport,
  SymbolView,
} from '@toopo/resolver';
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

/** No namespace imports — the default for the exact/value-root call-site cases. */
const noNamespaces: NamespaceImports = { size: 0, resolveMember: () => null };

/** A file with `import * as NS from './ui'`, where `NS.Button` is the export `Button`. */
const namespaces: NamespaceImports = {
  size: 1,
  resolveMember: (localName, member) =>
    localName === 'NS' && member === 'Button' ? { symbolId: 'B.', certainty: DETERMINISTIC } : null,
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
      noNamespaces,
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
    const edges = bindCallSite(
      site({ subKind: undefined, payload: [] }),
      resolvedImports,
      noNamespaces,
      symbols,
    );
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
    const edges = bindCallSite(
      site({ payload: [spread, positional] }),
      resolvedImports,
      noNamespaces,
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

  it('does not bind a named prop that the receiver does not declare', () => {
    const edges = bindCallSite(
      site({ payload: [named('unknown', '"x"')] }),
      resolvedImports,
      noNamespaces,
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
        noNamespaces,
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
      bindCallSite(
        site({ callee: 'obj.method', subKind: undefined }),
        withObj,
        noNamespaces,
        symbols,
      ),
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
    expect(bindCallSite(site({ callee: '' }), resolvedImports, noNamespaces, symbols)).toEqual([]);
    expect(
      bindCallSite(site({ callee: 'Unknown' }), resolvedImports, noNamespaces, symbols),
    ).toEqual([]);
  });

  it('resolves a namespace-member render (NS.Button) to the EXACT export, with its prop (C10)', () => {
    // `import * as NS` then `<NS.Button label="x" />` — the member IS the module
    // export `Button`, so it resolves exactly (not member-root) at full certainty.
    expect(
      bindCallSite(
        site({ callee: 'NS.Button', payload: [named('label', '"x"')] }),
        new Map(),
        namespaces,
        symbols,
      ),
    ).toEqual([
      {
        kind: 'calls',
        sourceId: 'cs.',
        targetId: 'B.',
        rule: 'react/renders-namespace-member',
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

  it('resolves a namespace-member call (non-render) with the call rule', () => {
    expect(
      bindCallSite(
        site({ callee: 'NS.Button', subKind: undefined }),
        new Map(),
        namespaces,
        symbols,
      ),
    ).toEqual([
      {
        kind: 'calls',
        sourceId: 'cs.',
        targetId: 'B.',
        rule: 'react/calls-namespace-member',
        certainty: DETERMINISTIC,
      },
    ]);
  });

  it('yields no edge when a namespace member names no resolvable export (no guess)', () => {
    expect(bindCallSite(site({ callee: 'NS.Missing' }), new Map(), namespaces, symbols)).toEqual(
      [],
    );
  });
});
