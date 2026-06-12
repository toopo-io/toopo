import { describe, expect, it } from 'vitest';
import { LOD_DETAIL_ZOOM, lodShowsDetail } from './canvas-lod';

describe('lodShowsDetail', () => {
  it('shows detail at and above the threshold', () => {
    expect(lodShowsDetail(1)).toBe(true);
    expect(lodShowsDetail(LOD_DETAIL_ZOOM)).toBe(true);
  });

  it('fades detail below the threshold (far-out, dense view)', () => {
    expect(lodShowsDetail(LOD_DETAIL_ZOOM - 0.01)).toBe(false);
    expect(lodShowsDetail(0.1)).toBe(false);
  });
});
