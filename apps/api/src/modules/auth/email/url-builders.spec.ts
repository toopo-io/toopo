import { describe, expect, it } from 'vitest';
import { buildResetPasswordUrl, buildVerifyEmailUrl } from './url-builders';

const FRONTEND = 'http://localhost:3000';

// The URL builders are locale-agnostic — `zz` is a SYNTHETIC placeholder locale
// proving a non-default segment is embedded verbatim, not a shipped language.

describe('buildVerifyEmailUrl', () => {
  it('builds a frontend URL with locale segment and token query', () => {
    const url = buildVerifyEmailUrl({
      token: 'eyJabc.def.ghi',
      locale: 'en',
      frontendOrigin: FRONTEND,
    });
    expect(url).toBe('http://localhost:3000/en/verify-email?token=eyJabc.def.ghi');
  });

  it('uses a non-default locale segment when provided', () => {
    const url = buildVerifyEmailUrl({
      token: 'tok',
      locale: 'zz',
      frontendOrigin: FRONTEND,
    });
    expect(url).toBe('http://localhost:3000/zz/verify-email?token=tok');
  });

  it('trims a trailing slash from the frontend origin', () => {
    const url = buildVerifyEmailUrl({
      token: 'tok',
      locale: 'zz',
      frontendOrigin: 'https://toopo.io/',
    });
    expect(url).toBe('https://toopo.io/zz/verify-email?token=tok');
  });

  it('URL-encodes special characters in the token', () => {
    const url = buildVerifyEmailUrl({
      token: 'a+b/c=d',
      locale: 'en',
      frontendOrigin: FRONTEND,
    });
    expect(url).toBe('http://localhost:3000/en/verify-email?token=a%2Bb%2Fc%3Dd');
  });

  it('produces a URL the WHATWG URL parser accepts', () => {
    const url = buildVerifyEmailUrl({
      token: 'tok',
      locale: 'en',
      frontendOrigin: FRONTEND,
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe(FRONTEND);
    expect(parsed.pathname).toBe('/en/verify-email');
    expect(parsed.searchParams.get('token')).toBe('tok');
  });
});

describe('buildResetPasswordUrl', () => {
  it('builds a frontend URL with locale segment and token query', () => {
    const url = buildResetPasswordUrl({
      token: 'rtok',
      locale: 'zz',
      frontendOrigin: FRONTEND,
    });
    expect(url).toBe('http://localhost:3000/zz/reset-password?token=rtok');
  });

  it('uses the en locale when provided', () => {
    const url = buildResetPasswordUrl({
      token: 'rtok',
      locale: 'en',
      frontendOrigin: FRONTEND,
    });
    expect(url).toBe('http://localhost:3000/en/reset-password?token=rtok');
  });

  it('trims a trailing slash from the frontend origin', () => {
    const url = buildResetPasswordUrl({
      token: 'rtok',
      locale: 'en',
      frontendOrigin: 'https://toopo.io/',
    });
    expect(url).toBe('https://toopo.io/en/reset-password?token=rtok');
  });

  it('URL-encodes special characters in the token', () => {
    const url = buildResetPasswordUrl({
      token: 'a+b/c=d',
      locale: 'zz',
      frontendOrigin: FRONTEND,
    });
    expect(url).toBe('http://localhost:3000/zz/reset-password?token=a%2Bb%2Fc%3Dd');
  });

  it('produces a URL the WHATWG URL parser accepts', () => {
    const url = buildResetPasswordUrl({
      token: 'rtok',
      locale: 'zz',
      frontendOrigin: FRONTEND,
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe(FRONTEND);
    expect(parsed.pathname).toBe('/zz/reset-password');
    expect(parsed.searchParams.get('token')).toBe('rtok');
  });
});
