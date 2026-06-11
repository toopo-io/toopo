import { describe, expect, it } from 'vitest';
import { isProjectMapped } from './mapped-status';

describe('isProjectMapped', () => {
  it('is mapped when the package map has at least one container', () => {
    expect(isProjectMapped({ nodes: [{}] as never })).toBe(true);
  });

  it('is not mapped yet when the package map is empty', () => {
    expect(isProjectMapped({ nodes: [] })).toBe(false);
  });
});
