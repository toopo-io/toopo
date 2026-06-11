import { describe, expect, it } from 'vitest';
import { WorkspaceListSchema, workspaceGlyph } from './workspace';

describe('workspaceGlyph', () => {
  it('takes the first alphanumeric character, uppercased', () => {
    expect(workspaceGlyph('Acme Labs')).toBe('A');
    expect(workspaceGlyph('notes-app')).toBe('N');
    expect(workspaceGlyph('  toopo')).toBe('T');
    expect(workspaceGlyph('7 wonders')).toBe('7');
  });

  it('skips leading punctuation to the first real character', () => {
    expect(workspaceGlyph('@acme')).toBe('A');
    expect(workspaceGlyph('___staging')).toBe('S');
  });

  it('falls back to a neutral mark when there is no alphanumeric character', () => {
    expect(workspaceGlyph('   ')).toBe('#');
    expect(workspaceGlyph('!!!')).toBe('#');
  });
});

describe('WorkspaceListSchema', () => {
  it('keeps only the fields the shell renders and drops unknown org-plugin keys', () => {
    const parsed = WorkspaceListSchema.parse([
      { id: 'ws_1', name: 'Acme Labs', slug: 'acme', logo: null, metadata: { plan: 'team' } },
    ]);
    expect(parsed).toEqual([{ id: 'ws_1', name: 'Acme Labs', slug: 'acme', logo: null }]);
  });

  it('rejects a workspace missing its identity', () => {
    expect(() => WorkspaceListSchema.parse([{ name: 'Nameless', slug: 'x' }])).toThrow();
  });
});
