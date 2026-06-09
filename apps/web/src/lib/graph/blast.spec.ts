import type { BlastRadiusPage } from '@toopo/api-contracts';
import { describe, expect, it } from 'vitest';
import { blastRows } from './blast';

const sym = (id: string, name: string) => ({ kind: 'symbol' as const, id, name, properties: {} });

const PAGE: BlastRadiusPage = {
  items: [
    { nodeId: 'b', depth: 2, node: sym('b', 'Beta') },
    { nodeId: 'a', depth: 1, node: sym('a', 'Alpha') },
    { nodeId: 'ext', depth: 1, node: null },
  ],
  nextCursor: null,
  truncated: true,
};

describe('blastRows', () => {
  it('orders by depth then label, surfacing the nearest dependents first', () => {
    const rows = blastRows(PAGE);
    expect(rows.map((r) => r.nodeId)).toEqual(['a', 'ext', 'b']);
    expect(rows[0]).toEqual({ nodeId: 'a', depth: 1, label: 'Alpha' });
  });

  it('shows no label for an unresolved dependent, never an invented one', () => {
    const rows = blastRows(PAGE);
    expect(rows.find((r) => r.nodeId === 'ext')?.label).toBeNull();
  });

  it('handles an empty blast radius', () => {
    expect(blastRows({ items: [], nextCursor: null, truncated: false })).toEqual([]);
  });
});
