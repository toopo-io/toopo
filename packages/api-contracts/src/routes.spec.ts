import { describe, expect, it } from 'vitest';
import { ROUTE_SEGMENTS } from './routes';

describe('ROUTE_SEGMENTS', () => {
  it('exposes the documented segment set', () => {
    expect(Object.keys(ROUTE_SEGMENTS).sort()).toEqual(
      [
        'ACCEPT_INVITATION',
        'ACCOUNT',
        'CONNECT',
        'FORGOT_PASSWORD',
        'GRAPH',
        'INSIGHTS',
        'PROJECTS',
        'RESET_PASSWORD',
        'SIGNIN',
        'SIGNUP',
        'VERIFY_EMAIL',
      ].sort(),
    );
  });

  it('pins the GitHub-App connect return segment', () => {
    expect(ROUTE_SEGMENTS.CONNECT).toBe('connect');
  });

  it('maps every key to a kebab-case URL segment without leading slash', () => {
    for (const value of Object.values(ROUTE_SEGMENTS)) {
      expect(value).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(value.startsWith('/')).toBe(false);
    }
  });

  it('pins the canonical values used by Better Auth email hooks', () => {
    expect(ROUTE_SEGMENTS.VERIFY_EMAIL).toBe('verify-email');
    expect(ROUTE_SEGMENTS.RESET_PASSWORD).toBe('reset-password');
    expect(ROUTE_SEGMENTS.ACCEPT_INVITATION).toBe('accept-invitation');
  });

  it('pins the canonical values used by the frontend auth flows', () => {
    expect(ROUTE_SEGMENTS.SIGNIN).toBe('signin');
    expect(ROUTE_SEGMENTS.SIGNUP).toBe('signup');
    expect(ROUTE_SEGMENTS.ACCOUNT).toBe('account');
    expect(ROUTE_SEGMENTS.FORGOT_PASSWORD).toBe('forgot-password');
  });

  it('pins the visual-cartography explorer and project segments', () => {
    expect(ROUTE_SEGMENTS.GRAPH).toBe('graph');
    expect(ROUTE_SEGMENTS.PROJECTS).toBe('projects');
  });
});
