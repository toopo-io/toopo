/**
 * The typed client for the GitHub-App connect API (ADR-0026 §2). `getInstallUrl`
 * fetches the signed install redirect; `completeInstall` posts the post-install
 * return. Both responses are validated against the api-contracts schema in
 * `requestJson` (ADR-0006) and ride the session cookie (credentials: include).
 */
import {
  type CompleteInstallRequest,
  type CompleteInstallResponse,
  CompleteInstallResponseSchema,
  githubInstallApiPath,
  githubInstallCompleteApiPath,
  type InstallUrlResponse,
  InstallUrlResponseSchema,
} from '@toopo/api-contracts';
import { requestJson } from '../http';

export function getInstallUrl(locale?: string, init?: RequestInit): Promise<InstallUrlResponse> {
  return requestJson(githubInstallApiPath(), InstallUrlResponseSchema, locale, init);
}

export function completeInstall(
  body: CompleteInstallRequest,
  locale?: string,
): Promise<CompleteInstallResponse> {
  return requestJson(githubInstallCompleteApiPath(), CompleteInstallResponseSchema, locale, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
