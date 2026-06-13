import { z } from 'zod';

/**
 * The GitHub-App credential fields (ADR-0026 §1), shared by `apps/api` (the connect
 * flow + first-scan + webhook) and `apps/worker` (installation-token minting for
 * private clones). Every field is **optional**: a self-host with no GitHub App
 * still boots (graceful degradation, ADR-0024 §3), and the surfaces that need a
 * credential fail closed when it is absent rather than blocking startup.
 *
 * The webhook secret is deliberately NOT here — it is ADR-0024's existing
 * `GITHUB_WEBHOOK_SECRET`, reused as the App's webhook secret, and stays owned by
 * the consumer that already declares it.
 *
 * The private key is supplied **base64-encoded** (ADR-0026 §7): the PEM is
 * multiline and multiline values are fragile across `.env` parsers. The env layer
 * validates that the value decodes to a PEM (a `.refine`, keeping input and output
 * both `string`); {@link decodeGithubAppPrivateKey} performs the decode at the
 * point of use.
 *
 * The fields are exported individually so a consumer composes them as **literal
 * properties** of its own `z.object` (`GITHUB_APP_ID: githubAppIdSchema, …`) rather
 * than spreading a second shape — a second spread into `z.object` widens the
 * inferred env type to an index signature under TypeScript + Zod v4.
 * {@link githubAppEnvSchema} is the standalone object for callers that validate the
 * App credentials in isolation (e.g. the worker).
 */

/** Decode a base64 value to UTF-8, tolerating non-base64 input (returns ''). */
function decodeBase64(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

/** True when the base64 value decodes to something containing a PEM key block. */
function isBase64Pem(value: string): boolean {
  return decodeBase64(value).includes('PRIVATE KEY');
}

/**
 * Decode the base64 `GITHUB_APP_PRIVATE_KEY` env value to a plain PEM string. The
 * value is already validated by {@link githubAppPrivateKeySchema}; callers pass the
 * validated string straight through at construction time.
 */
export function decodeGithubAppPrivateKey(base64PrivateKey: string): string {
  return decodeBase64(base64PrivateKey);
}

/** The GitHub App's numeric id (App settings → "App ID"). */
export const githubAppIdSchema = z.coerce.number().int().positive().optional();
/** Base64-encoded PEM; decode with {@link decodeGithubAppPrivateKey}. */
export const githubAppPrivateKeySchema = z
  .string()
  .trim()
  .min(1)
  .refine(isBase64Pem, {
    message: 'must be a base64-encoded PEM private key (decoded value lacks a PRIVATE KEY block)',
  })
  .optional();
/** OAuth client id for the install redirect. */
export const githubAppClientIdSchema = z.string().trim().min(1).optional();
/** OAuth client secret for the install redirect. */
export const githubAppClientSecretSchema = z.string().trim().min(1).optional();
/** The App slug, used to build `https://github.com/apps/<slug>/installations/new`. */
export const githubAppSlugSchema = z.string().trim().min(1).optional();

export const githubAppEnvSchema = z.object({
  GITHUB_APP_ID: githubAppIdSchema,
  GITHUB_APP_PRIVATE_KEY: githubAppPrivateKeySchema,
  GITHUB_APP_CLIENT_ID: githubAppClientIdSchema,
  GITHUB_APP_CLIENT_SECRET: githubAppClientSecretSchema,
  GITHUB_APP_SLUG: githubAppSlugSchema,
});
export type GithubAppEnv = z.infer<typeof githubAppEnvSchema>;
