/**
 * DI tokens for the GitHub-App connect module (ADR-0026). Each is a value resolved
 * from validated `Env`, so the connect surfaces fail closed when the App is
 * unconfigured (ADR-0026 §1): `GITHUB_APP_AUTH` is `null`, `GITHUB_APP_SLUG` is
 * `undefined`, and the service turns either into a `503`.
 */
import type { GithubAppAuth } from '@toopo/github-app';

/** The App-auth port, or `null` when the App credentials are unset (fail-closed). */
export const GITHUB_APP_AUTH = Symbol.for('toopo.github-app-auth');
/** The App slug for the install redirect URL, or `undefined` when unset. */
export const GITHUB_APP_SLUG = Symbol.for('toopo.github-app-slug');
/** The secret signing the session-bound install `state` (ADR-0026 §7). */
export const GITHUB_INSTALL_STATE_SECRET = Symbol.for('toopo.github-install-state-secret');

/** The injected type behind {@link GITHUB_APP_AUTH}. */
export type GithubAppAuthProvider = GithubAppAuth | null;
