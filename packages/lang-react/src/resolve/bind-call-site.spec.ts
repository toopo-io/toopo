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
const noNamespaces: NamespaceImports = {
  size: 0,
  resolveMember: () => ({ status: 'not-namespace' }),
};

/** A file with `import * as NS from './ui'` (module file `M.`): `NS.Button` is the
 * export `Button`; any other member is an anchored gap on the module `M.`. */
const namespaces: NamespaceImports = {
  size: 1,
  resolveMember: (localName, member) => {
    if (localName !== 'NS') {
      return { status: 'not-namespace' };
    }
    return member === 'Button'
      ? { status: 'resolved', symbolId: 'B.', certainty: DETERMINISTIC }
      : { status: 'unresolved-member', rootFileId: 'M.' };
  },
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
    const result = bindCallSite(
      site({ payload: [named('label', '"x"')] }),
      resolvedImports,
      noNamespaces,
      symbols,
    );
    expect(result).toEqual({
      edges: [
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
      ],
      unresolved: [],
    });
  });

  it('emits a plain call edge (no render subKind) for a non-render callee', () => {
    const result = bindCallSite(
      site({ subKind: undefined, payload: [] }),
      resolvedImports,
      noNamespaces,
      symbols,
    );
    expect(result).toEqual({
      edges: [
        {
          kind: 'calls',
          sourceId: 'cs.',
          targetId: 'B.',
          rule: 'react/calls-import',
          certainty: DETERMINISTIC,
        },
      ],
      unresolved: [],
    });
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
    const result = bindCallSite(
      site({ payload: [spread, positional] }),
      resolvedImports,
      noNamespaces,
      symbols,
    );
    expect(result).toEqual({
      edges: [
        {
          kind: 'calls',
          sourceId: 'cs.',
          targetId: 'B.',
          rule: 'react/renders-import',
          subKind: 'react:renders',
          certainty: DETERMINISTIC,
        },
      ],
      unresolved: [],
    });
  });

  it('does not bind a named prop that the receiver does not declare', () => {
    const result = bindCallSite(
      site({ payload: [named('unknown', '"x"')] }),
      resolvedImports,
      noNamespaces,
      symbols,
    );
    expect(result.edges).toEqual([
      {
        kind: 'calls',
        sourceId: 'cs.',
        targetId: 'B.',
        rule: 'react/renders-import',
        subKind: 'react:renders',
        certainty: DETERMINISTIC,
      },
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it('binds a member-root render (Form.Item → Form) as an inferred edge AND records the unresolved member (C11)', () => {
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
    ).toEqual({
      edges: [
        {
          kind: 'calls',
          sourceId: 'cs.',
          targetId: 'F.',
          rule: 'react/renders-member-root',
          subKind: 'react:memberRoot',
          certainty: { resolution: 'inferred', confidence: 'medium' },
        },
      ],
      // The member `Item` got no edge — anchored to Form's root so a later "unused"
      // view never reads Item as genuinely absent (the cardinal false positive).
      unresolved: [
        { reason: 'member-root', callee: 'Form.Item', member: 'Item', rootSymbolId: 'F.' },
      ],
    });
  });

  it('binds a member-root call (obj.method) to its root, inferred, AND records the member', () => {
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
    ).toEqual({
      edges: [
        {
          kind: 'calls',
          sourceId: 'cs.',
          targetId: 'O.',
          rule: 'react/calls-member-root',
          subKind: 'react:memberRoot',
          certainty: { resolution: 'inferred', confidence: 'medium' },
        },
      ],
      unresolved: [
        { reason: 'member-root', callee: 'obj.method', member: 'method', rootSymbolId: 'O.' },
      ],
    });
  });

  it('records an anchorless gap when the member-root root is neither import nor namespace (unbound-root)', () => {
    // `handler.run()` where `handler` is a local/param — no resolvable root, so the
    // member is recorded by name alone (sound, coarse: the price of a lost root type).
    expect(
      bindCallSite(site({ callee: 'handler.run' }), resolvedImports, noNamespaces, symbols),
    ).toEqual({
      edges: [],
      unresolved: [{ reason: 'unbound-root', callee: 'handler.run', member: 'run' }],
    });
  });

  it('yields nothing for an empty callee or an unresolved exact import (not a member usage)', () => {
    expect(bindCallSite(site({ callee: '' }), resolvedImports, noNamespaces, symbols)).toEqual({
      edges: [],
      unresolved: [],
    });
    expect(
      bindCallSite(site({ callee: 'Unknown' }), resolvedImports, noNamespaces, symbols),
    ).toEqual({
      edges: [],
      unresolved: [],
    });
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
    ).toEqual({
      edges: [
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
      ],
      unresolved: [],
    });
  });

  it('resolves a namespace-member call (non-render) with the call rule', () => {
    expect(
      bindCallSite(
        site({ callee: 'NS.Button', subKind: undefined }),
        new Map(),
        namespaces,
        symbols,
      ),
    ).toEqual({
      edges: [
        {
          kind: 'calls',
          sourceId: 'cs.',
          targetId: 'B.',
          rule: 'react/calls-namespace-member',
          certainty: DETERMINISTIC,
        },
      ],
      unresolved: [],
    });
  });

  it('records an anchored gap (no edge) when a namespace member names no resolvable export (C11)', () => {
    // `NS.Missing` — NS is a resolvable namespace but `Missing` is no export, so the
    // gap is anchored to NS's module file `M.` (not a guess, not an edge).
    expect(bindCallSite(site({ callee: 'NS.Missing' }), new Map(), namespaces, symbols)).toEqual({
      edges: [],
      unresolved: [
        { reason: 'namespace-member', callee: 'NS.Missing', member: 'Missing', rootSymbolId: 'M.' },
      ],
    });
  });
});
