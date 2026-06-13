import type { z } from 'zod';

export class EnvValidationError extends Error {
  public readonly issues: z.core.$ZodIssue[];

  constructor(message: string, issues: z.core.$ZodIssue[]) {
    super(message);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/**
 * Treat empty-string env values as missing.
 *
 * dotenv (and `@nestjs/config`) parse `KEY=` as `process.env.KEY === ''`,
 * which Zod's `.optional()` does NOT accept (only `undefined` is). Without
 * this normalization, an unfilled optional like `GOOGLE_CLIENT_ID=` in
 * `.env` fails `.min(1).optional()` validation at boot — per ADR-0008
 * (env validation at module load: fail fast, never silently pass).
 */
function sanitizeEmptyStrings(
  raw: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = value === '' ? undefined : value;
  }
  return out;
}

export function createEnvValidator<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
): (raw: Record<string, string | undefined>) => z.infer<TSchema> {
  return (raw) => {
    const result = schema.safeParse(sanitizeEmptyStrings(raw));
    if (!result.success) {
      const summary = result.error.issues
        .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
        .join('\n');
      throw new EnvValidationError(
        `Invalid environment variables:\n${summary}`,
        result.error.issues,
      );
    }
    return result.data;
  };
}
