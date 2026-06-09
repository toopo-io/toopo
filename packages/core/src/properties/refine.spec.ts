import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { withProperties } from './refine';

const BaseSchema = z
  .object({
    id: z.string(),
    properties: z.record(z.string(), z.unknown()),
  })
  .strict();

const ReactProps = z
  .object({
    displayName: z.string(),
    isExported: z.boolean(),
  })
  .strict();

describe('withProperties', () => {
  it('narrows the open properties bag to the refined shape', () => {
    const refined = withProperties(BaseSchema, ReactProps);
    const result = refined.safeParse({
      id: 'sym',
      properties: { displayName: 'Button', isExported: true },
    });
    expect(result.success).toBe(true);
  });

  it('rejects properties that violate the refined shape', () => {
    const refined = withProperties(BaseSchema, ReactProps);
    const result = refined.safeParse({
      id: 'sym',
      properties: { displayName: 'Button' },
    });
    expect(result.success).toBe(false);
  });

  it('preserves the base fields', () => {
    const refined = withProperties(BaseSchema, ReactProps);
    const result = refined.safeParse({
      properties: { displayName: 'Button', isExported: false },
    });
    expect(result.success).toBe(false);
  });
});
