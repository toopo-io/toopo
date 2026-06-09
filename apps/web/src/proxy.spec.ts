import { describe, expect, it } from 'vitest';
import { isProtectedPath } from './proxy.helpers';

describe('isProtectedPath (Phase 4.1 bug B5)', () => {
  it('protects /account exactly', () => {
    expect(isProtectedPath('/account')).toBe(true);
  });

  it('protects /account/<anything> subpaths', () => {
    expect(isProtectedPath('/account/settings')).toBe(true);
    expect(isProtectedPath('/account/profile/edit')).toBe(true);
  });

  it('does not protect the root path', () => {
    expect(isProtectedPath('/')).toBe(false);
  });

  it('does not protect auth pages', () => {
    expect(isProtectedPath('/signin')).toBe(false);
    expect(isProtectedPath('/signup')).toBe(false);
    expect(isProtectedPath('/forgot-password')).toBe(false);
    expect(isProtectedPath('/reset-password')).toBe(false);
    expect(isProtectedPath('/verify-email')).toBe(false);
  });

  it('does not protect unknown 404 paths — they fall through to Next routing', () => {
    expect(isProtectedPath('/does-not-exist')).toBe(false);
    expect(isProtectedPath('/some/deeply/nested/bogus/path')).toBe(false);
  });

  it('does not match paths that merely start with the protected prefix substring', () => {
    expect(isProtectedPath('/accounts')).toBe(false);
    expect(isProtectedPath('/account-settings')).toBe(false);
  });

  it('treats the empty pathAfterLocale as root (not protected)', () => {
    expect(isProtectedPath('')).toBe(false);
  });
});
