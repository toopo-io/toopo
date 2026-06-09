import { describe, expect, expectTypeOf, it } from 'vitest';
import type { BaseEnv, LogLevel, NodeEnv } from './base';
import { baseEnvSchema, LogLevelSchema, NodeEnvSchema } from './base';

describe('baseEnvSchema', () => {
  it('applies defaults when both fields are missing', () => {
    const parsed = baseEnvSchema.parse({});
    expect(parsed).toEqual({ NODE_ENV: 'development', LOG_LEVEL: 'info' });
  });

  it('parses explicit valid values', () => {
    const parsed = baseEnvSchema.parse({ NODE_ENV: 'production', LOG_LEVEL: 'warn' });
    expect(parsed).toEqual({ NODE_ENV: 'production', LOG_LEVEL: 'warn' });
  });

  it('rejects an unknown NODE_ENV', () => {
    const result = baseEnvSchema.safeParse({ NODE_ENV: 'staging' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    const result = baseEnvSchema.safeParse({ LOG_LEVEL: 'trace' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-string NODE_ENV', () => {
    const result = baseEnvSchema.safeParse({ NODE_ENV: 42 });
    expect(result.success).toBe(false);
  });

  it('infers BaseEnv as the union of NodeEnv and LogLevel fields', () => {
    expectTypeOf<BaseEnv>().toEqualTypeOf<{ NODE_ENV: NodeEnv; LOG_LEVEL: LogLevel }>();
  });
});

describe('NodeEnvSchema', () => {
  it('accepts development, production, test', () => {
    expect(NodeEnvSchema.safeParse('development').success).toBe(true);
    expect(NodeEnvSchema.safeParse('production').success).toBe(true);
    expect(NodeEnvSchema.safeParse('test').success).toBe(true);
  });

  it('rejects an unknown value', () => {
    expect(NodeEnvSchema.safeParse('staging').success).toBe(false);
  });
});

describe('LogLevelSchema', () => {
  it('accepts debug, info, warn, error', () => {
    expect(LogLevelSchema.safeParse('debug').success).toBe(true);
    expect(LogLevelSchema.safeParse('info').success).toBe(true);
    expect(LogLevelSchema.safeParse('warn').success).toBe(true);
    expect(LogLevelSchema.safeParse('error').success).toBe(true);
  });

  it('rejects an unknown value', () => {
    expect(LogLevelSchema.safeParse('trace').success).toBe(false);
  });
});
