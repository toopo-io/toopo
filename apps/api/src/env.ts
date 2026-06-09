import { createEnvValidator } from '@toopo/env';
import { ApiEnvSchema } from './core/config/env.schema';

export const Env = createEnvValidator(ApiEnvSchema)(
  process.env as Record<string, string | undefined>,
);
export type Env = typeof Env;
