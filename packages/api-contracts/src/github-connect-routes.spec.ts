import { describe, expect, it } from 'vitest';
import {
  GITHUB_CONNECT_CONTROLLER_PATH,
  GITHUB_INSTALL_COMPLETE_SEGMENT,
  GITHUB_INSTALL_SEGMENT,
  githubInstallApiPath,
  githubInstallCompleteApiPath,
} from './github-connect-routes';

describe('github connect routes', () => {
  it('exposes the controller base and segments', () => {
    expect(GITHUB_CONNECT_CONTROLLER_PATH).toBe('github');
    expect(GITHUB_INSTALL_SEGMENT).toBe('install');
    expect(GITHUB_INSTALL_COMPLETE_SEGMENT).toBe('install/complete');
  });

  it('builds versioned client paths', () => {
    expect(githubInstallApiPath()).toBe('/v1/github/install');
    expect(githubInstallCompleteApiPath()).toBe('/v1/github/install/complete');
  });
});
