import { describe, expect, it } from 'vitest';
import { composeSignature, parseJsdoc } from './node-signature';

describe('composeSignature', () => {
  it('composes name, typed params, and return type', () => {
    expect(
      composeSignature('clamp', [{ name: 'value', type: 'number' }, { name: 'max' }], 'number'),
    ).toBe('clamp(value: number, max): number');
  });

  it('omits the parens when no parameters are known (never asserts zero args)', () => {
    expect(composeSignature('useThing', [])).toBe('useThing');
  });

  it('omits the return type when absent', () => {
    expect(composeSignature('render', [{ name: 'props', type: 'Props' }])).toBe(
      'render(props: Props)',
    );
  });
});

describe('parseJsdoc', () => {
  it('strips the fence and margins and keeps the description verbatim', () => {
    const parsed = parseJsdoc('/**\n * Clamps a value to a max.\n */');
    expect(parsed?.description).toBe('Clamps a value to a max.');
    expect(parsed?.tags).toEqual([]);
  });

  it('keeps @param and @returns tags verbatim, in order', () => {
    const parsed = parseJsdoc(
      '/**\n * Clamps a value.\n * @param value the input\n * @returns the clamped value\n */',
    );
    expect(parsed?.description).toBe('Clamps a value.');
    expect(parsed?.tags).toEqual([
      { tag: 'param', text: 'value the input' },
      { tag: 'returns', text: 'the clamped value' },
    ]);
  });

  it('folds a wrapped tag continuation onto the same tag', () => {
    const parsed = parseJsdoc('/**\n * @param value a long\n *   wrapped description\n */');
    expect(parsed?.tags).toEqual([{ tag: 'param', text: 'value a long wrapped description' }]);
  });

  it('returns null for an empty comment', () => {
    expect(parseJsdoc('/** */')).toBeNull();
    expect(parseJsdoc('')).toBeNull();
  });

  it('parses a single-line comment', () => {
    expect(parseJsdoc('/** A one-liner. */')?.description).toBe('A one-liner.');
  });

  it('strips {@link} decoration to the bare name (description and tags)', () => {
    expect(parseJsdoc('/** See {@link GraphExplorer} for details. */')?.description).toBe(
      'See GraphExplorer for details.',
    );
    const parsed = parseJsdoc(
      '/**\n * Wraps {@link Inner|the inner view}.\n * @returns {@link JSX.Element}\n */',
    );
    expect(parsed?.description).toBe('Wraps Inner.');
    expect(parsed?.tags).toEqual([{ tag: 'returns', text: 'JSX.Element' }]);
  });
});
