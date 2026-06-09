import { describe, expect, it } from 'vitest';
import { AnalysisSchema, AnalysisStatusSchema } from './analysis-status';

describe('AnalysisStatusSchema', () => {
  it('accepts the four statuses', () => {
    for (const status of ['analyzed', 'unsupported-language', 'parse-error', 'skipped']) {
      expect(AnalysisStatusSchema.safeParse(status).success).toBe(true);
    }
  });
});

describe('AnalysisSchema', () => {
  it('accepts analyzed without a reason', () => {
    expect(AnalysisSchema.safeParse({ status: 'analyzed' }).success).toBe(true);
  });

  it('requires a reason for non-analyzed statuses', () => {
    expect(AnalysisSchema.safeParse({ status: 'skipped' }).success).toBe(false);
    expect(AnalysisSchema.safeParse({ status: 'skipped', reason: 'binary file' }).success).toBe(
      true,
    );
    expect(
      AnalysisSchema.safeParse({ status: 'parse-error', reason: 'syntax error at 3:1' }).success,
    ).toBe(true);
  });

  it('rejects a reason on analyzed (strict)', () => {
    expect(AnalysisSchema.safeParse({ status: 'analyzed', reason: 'x' }).success).toBe(false);
  });
});
