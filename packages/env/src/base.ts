import { z } from 'zod';

export const NodeEnvSchema = z.enum(['development', 'production', 'test']);
export type NodeEnv = z.infer<typeof NodeEnvSchema>;

export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevelSchema>;

export const baseEnvShape = {
  NODE_ENV: NodeEnvSchema.default('development'),
  LOG_LEVEL: LogLevelSchema.default('info'),
} as const;

export const baseEnvSchema = z.object(baseEnvShape);
export type BaseEnv = z.infer<typeof baseEnvSchema>;
