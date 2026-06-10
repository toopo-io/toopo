/**
 * Resolve the worker's GitHub-App auth from the environment (ADR-0026 §1, §5).
 * The consume path mints an installation token per private-repo job; the App
 * credentials (id + base64 PEM) are read here. Fail-closed graceful degradation:
 * with either credential unset the worker stays public-clone only (the B4
 * behavior) and the deterministic core is untouched. A present-but-invalid
 * credential fails loud (a misconfiguration, not a silent downgrade).
 *
 * Only the two fields the worker needs are read — the webhook secret, client
 * id/secret, and slug belong to the API's connect flow, not the worker.
 */
import {
  decodeGithubAppPrivateKey,
  githubAppIdSchema,
  githubAppPrivateKeySchema,
} from '@toopo/env';
import { createGithubAppAuth, type GithubAppAuth } from '@toopo/github-app';

export function resolveWorkerGithubAppAuth(env: NodeJS.ProcessEnv): GithubAppAuth | null {
  const appIdRaw = env['GITHUB_APP_ID'];
  const privateKeyRaw = env['GITHUB_APP_PRIVATE_KEY'];
  if (
    appIdRaw === undefined ||
    appIdRaw.trim() === '' ||
    privateKeyRaw === undefined ||
    privateKeyRaw.trim() === ''
  ) {
    return null;
  }
  const appId = githubAppIdSchema.parse(appIdRaw);
  const privateKey = githubAppPrivateKeySchema.parse(privateKeyRaw);
  if (appId === undefined || privateKey === undefined) {
    return null;
  }
  return createGithubAppAuth({ appId, privateKey: decodeGithubAppPrivateKey(privateKey) });
}
