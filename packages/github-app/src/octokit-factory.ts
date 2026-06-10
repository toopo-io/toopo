/**
 * The external-SDK boundary (ADR-0026 §4): the only module that touches real
 * `@octokit/core` + `@octokit/auth-app`. `createAppAuth` owns the security-sensitive
 * crypto — minting the App JWT from the PEM and signing requests — which we never
 * hand-roll (fork F1). App-level requests mint installation tokens; an
 * installation-scoped client reads that installation's repos. Both are adapted to
 * the narrow {@link OctokitLike} seam so the rest of the package stays octokit-free
 * and unit-testable with a fake. Excluded from coverage (no business logic;
 * validated via the smee.io tunnel procedure, B5.7).
 */
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/core';
import type { OctokitFactory, OctokitLike } from './github-app-client.js';

/** The decoded App credentials (the PEM is already base64-decoded at the env boundary). */
export interface GithubAppConfig {
  readonly appId: number;
  readonly privateKey: string;
}

/**
 * Adapt an `Octokit` to {@link OctokitLike}. `Octokit.request` is overloaded on a
 * literal-route union; our routes pass through the seam as plain strings, so we
 * adapt via one typed cast at this boundary — the request params and response
 * shapes are validated downstream by `github-app-client`'s Zod schemas.
 */
function toOctokitLike(octokit: Octokit): OctokitLike {
  return { request: octokit.request as unknown as OctokitLike['request'] };
}

export function createOctokitFactory(config: GithubAppConfig): OctokitFactory {
  const appOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: config.appId, privateKey: config.privateKey },
  });
  return {
    app(): OctokitLike {
      return toOctokitLike(appOctokit);
    },
    forInstallation(installationId: number): OctokitLike {
      return toOctokitLike(
        new Octokit({
          authStrategy: createAppAuth,
          auth: { appId: config.appId, privateKey: config.privateKey, installationId },
        }),
      );
    },
  };
}
