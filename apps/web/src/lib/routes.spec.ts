import { describe, expect, it } from 'vitest';
import { absoluteRoutes, protectedPathPrefixes, routes } from './routes';

const ORIGIN = 'http://localhost:3000';

// The route builders are intentionally locale-agnostic string functions — they
// do not validate against SUPPORTED_LOCALES. `zz` is a SYNTHETIC placeholder
// locale used here to prove the builders work for any non-default segment, not
// a shipped product language.
const OTHER_LOCALE = 'zz';

describe('routes (relative)', () => {
  describe('signin', () => {
    it('builds the en path', () => {
      expect(routes.signin('en')).toBe('/en/signin');
    });
    it('builds a non-default locale path', () => {
      expect(routes.signin(OTHER_LOCALE)).toBe('/zz/signin');
    });
  });

  describe('signinNext', () => {
    it('encodes the next target', () => {
      expect(routes.signinNext('en', '/en/account')).toBe('/en/signin?next=%2Fen%2Faccount');
    });
    it('encodes special characters in next', () => {
      expect(routes.signinNext('zz', '/zz/account?a=b&c=d')).toBe(
        '/zz/signin?next=%2Fzz%2Faccount%3Fa%3Db%26c%3Dd',
      );
    });
  });

  describe('signinAfterVerify', () => {
    it('pins the post-verification query', () => {
      expect(routes.signinAfterVerify('en')).toBe('/en/signin?verified=1');
      expect(routes.signinAfterVerify('zz')).toBe('/zz/signin?verified=1');
    });
  });

  describe('signinAfterReset', () => {
    it('pins the post-reset query', () => {
      expect(routes.signinAfterReset('en')).toBe('/en/signin?reset=1');
      expect(routes.signinAfterReset('zz')).toBe('/zz/signin?reset=1');
    });
  });

  describe('signup / account / forgotPassword / resetPassword / verifyEmail / graph', () => {
    it('each builds its locale-prefixed path', () => {
      expect(routes.signup('en')).toBe('/en/signup');
      expect(routes.account('zz')).toBe('/zz/account');
      expect(routes.forgotPassword('en')).toBe('/en/forgot-password');
      expect(routes.resetPassword('zz')).toBe('/zz/reset-password');
      expect(routes.verifyEmail('en')).toBe('/en/verify-email');
      expect(routes.projects('en')).toBe('/en/projects');
      expect(routes.projectGraph('en', 'p1')).toBe('/en/projects/p1/graph');
      expect(routes.projectGraph('zz', 'a/b')).toBe('/zz/projects/a%2Fb/graph');
    });
  });

  describe('verifyEmailWithEmail', () => {
    it('encodes the email value', () => {
      expect(routes.verifyEmailWithEmail('en', 'user@example.com')).toBe(
        '/en/verify-email?email=user%40example.com',
      );
    });
    it('encodes a + alias', () => {
      expect(routes.verifyEmailWithEmail('zz', 'user+tag@example.com')).toBe(
        '/zz/verify-email?email=user%2Btag%40example.com',
      );
    });
  });

  describe('shape', () => {
    it('every route helper returns a path that the WHATWG URL parser accepts as a path-relative reference', () => {
      const samples: ReadonlyArray<string> = [
        routes.signin('en'),
        routes.signinNext('en', '/en/account'),
        routes.signinAfterVerify('zz'),
        routes.signinAfterReset('en'),
        routes.signup('zz'),
        routes.account('en'),
        routes.verifyEmail('zz'),
        routes.verifyEmailWithEmail('en', 'a@b.co'),
        routes.forgotPassword('zz'),
        routes.resetPassword('en'),
      ];
      for (const path of samples) {
        expect(path.startsWith('/')).toBe(true);
        const parsed = new URL(path, 'http://test.local');
        expect(parsed.pathname.startsWith('/en/') || parsed.pathname.startsWith('/zz/')).toBe(true);
      }
    });
  });
});

describe('absoluteRoutes', () => {
  it('account prepends origin to the relative path', () => {
    expect(absoluteRoutes.account(ORIGIN, 'en')).toBe('http://localhost:3000/en/account');
  });

  it('verifyEmailDone embeds the legacy `verified=1` callback query', () => {
    expect(absoluteRoutes.verifyEmailDone(ORIGIN, 'zz')).toBe(
      'http://localhost:3000/zz/verify-email?verified=1',
    );
  });

  it('resetPassword prepends origin to the relative reset path', () => {
    expect(absoluteRoutes.resetPassword(ORIGIN, 'en')).toBe(
      'http://localhost:3000/en/reset-password',
    );
  });

  it('produces URLs the WHATWG URL parser accepts as absolute', () => {
    const url = absoluteRoutes.account(ORIGIN, 'zz');
    const parsed = new URL(url);
    expect(parsed.origin).toBe(ORIGIN);
    expect(parsed.pathname).toBe('/zz/account');
  });
});

describe('protectedPathPrefixes', () => {
  it('exposes the locale-stripped protected prefixes (account + projects + connect)', () => {
    expect(protectedPathPrefixes).toEqual(['/account', '/projects', '/connect']);
  });

  it('pins the canonical set size for future regressions', () => {
    expect(protectedPathPrefixes.length).toBe(3);
  });
});
