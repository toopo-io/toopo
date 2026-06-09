import { describe, expect, it } from 'vitest';
import { buildAliasTable } from './tsconfig';

describe('buildAliasTable', () => {
  it('resolves path targets against baseUrl and the tsconfig directory, keeping the * capture', () => {
    const rules = buildAliasTable(
      { baseUrl: './src', paths: { '@/*': ['*'], '@components/*': ['components/*'] } },
      'apps/web',
    );
    expect(rules).toEqual([
      { pattern: '@/*', targets: ['apps/web/src/*'] },
      { pattern: '@components/*', targets: ['apps/web/src/components/*'] },
    ]);
  });

  it('defaults baseUrl to the tsconfig directory and keeps multiple fallback targets', () => {
    const rules = buildAliasTable({ paths: { '~/*': ['lib/*', 'vendor/*'] } }, '');
    expect(rules).toEqual([{ pattern: '~/*', targets: ['lib/*', 'vendor/*'] }]);
  });

  it('returns no rules when paths is absent', () => {
    expect(buildAliasTable({}, 'pkg')).toEqual([]);
  });
});
