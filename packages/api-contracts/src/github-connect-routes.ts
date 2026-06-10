/**
 * Canonical GitHub-App connect route paths (ADR-0026 §2, ADR-0014 spirit): one
 * source of truth shared by the backend controller and the web "Connect" UX. The
 * endpoints live under `/v1/github/*` behind the session guard — the signed-in
 * user initiates the install (`install`) and the post-install return completes it
 * (`install/complete`).
 */
import { GRAPH_API_VERSION } from './graph-routes.js';

/** The GitHub connect controller base path (under the version prefix). */
export const GITHUB_CONNECT_CONTROLLER_PATH = 'github';

/** Initiation segment: returns the GitHub App install redirect URL. */
export const GITHUB_INSTALL_SEGMENT = 'install';

/** Return segment: links the installation to the session user and provisions repos. */
export const GITHUB_INSTALL_COMPLETE_SEGMENT = 'install/complete';

/** The full client path for install initiation, e.g. `/v1/github/install`. */
export function githubInstallApiPath(): string {
  return `/v${GRAPH_API_VERSION}/${GITHUB_CONNECT_CONTROLLER_PATH}/${GITHUB_INSTALL_SEGMENT}`;
}

/** The full client path for install completion, e.g. `/v1/github/install/complete`. */
export function githubInstallCompleteApiPath(): string {
  return `/v${GRAPH_API_VERSION}/${GITHUB_CONNECT_CONTROLLER_PATH}/${GITHUB_INSTALL_COMPLETE_SEGMENT}`;
}
