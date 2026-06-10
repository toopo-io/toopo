/**
 * DI tokens for the GitHub webhook module (ADR-0024). The secret is provided as
 * a value (resolved from validated `Env`) rather than read globally, so the gate
 * is constructed with an explicit dependency and tested with any configuration —
 * including the unset case that must fail closed.
 */

/** The configured `GITHUB_WEBHOOK_SECRET` (`string`), or `undefined` when unset. */
export const GITHUB_WEBHOOK_SECRET = Symbol.for('toopo.github-webhook-secret');
