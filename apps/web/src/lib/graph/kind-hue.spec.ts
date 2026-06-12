import { describe, expect, it } from 'vitest';
import { kindHue, kindHueVar } from './kind-hue';

describe('kindHue', () => {
  it('maps structural kinds straight to a hue', () => {
    expect(kindHue('package')).toBe('package');
    expect(kindHue('repo')).toBe('package');
    expect(kindHue('file')).toBe('file');
  });

  it('colours a symbol by its subKind', () => {
    expect(kindHue('symbol', 'react:component')).toBe('component');
    expect(kindHue('symbol', 'react:hook')).toBe('hook');
    expect(kindHue('symbol', 'ts:interface')).toBe('type');
    expect(kindHue('symbol', 'ts:class')).toBe('type');
    expect(kindHue('symbol', 'ts:function')).toBe('function');
  });

  it('falls back to the generic function hue for an unmapped or absent subKind', () => {
    expect(kindHue('symbol')).toBe('function');
    expect(kindHue('symbol', 'ts:variable')).toBe('function');
    expect(kindHue('symbol', 'unknown:thing')).toBe('function');
  });

  it('renders the matching CSS custom property reference', () => {
    expect(kindHueVar('package')).toBe('var(--color-kind-package)');
    expect(kindHueVar('symbol', 'react:hook')).toBe('var(--color-kind-hook)');
  });
});
