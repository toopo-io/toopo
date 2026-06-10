/**
 * Adversarial tests for the signature gate's pure core (ADR-0024 §1). This is
 * the security boundary: the function must accept only a signature that is the
 * HMAC-SHA256 of the EXACT raw bytes under the configured secret, and must never
 * throw on a hostile header (the `timingSafeEqual` length trap in particular).
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyGithubSignature } from './github-signature';

const SECRET = 'a-test-webhook-secret-0123456789';
const BODY = Buffer.from(JSON.stringify({ ref: 'refs/heads/main', after: 'a'.repeat(40) }));

/** The signature GitHub would send for `body` under `secret`. */
function sign(body: Buffer, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('verifyGithubSignature', () => {
  it('accepts a signature computed over the exact raw body under the secret', () => {
    expect(verifyGithubSignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it('rejects a valid signature for a DIFFERENT body (HMAC is over the raw bytes)', () => {
    const tamperedBody = Buffer.from(
      JSON.stringify({ ref: 'refs/heads/main', after: 'b'.repeat(40) }),
    );
    // A signature legitimately computed for BODY must not validate tamperedBody.
    expect(verifyGithubSignature(tamperedBody, sign(BODY, SECRET), SECRET)).toBe(false);
  });

  it('rejects a signature computed under the wrong secret', () => {
    expect(verifyGithubSignature(BODY, sign(BODY, 'the-wrong-secret-9876543210'), SECRET)).toBe(
      false,
    );
  });

  it('rejects an undefined header (missing signature)', () => {
    expect(verifyGithubSignature(BODY, undefined, SECRET)).toBe(false);
  });

  it('rejects a header without the sha256= prefix', () => {
    const hex = createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifyGithubSignature(BODY, hex, SECRET)).toBe(false);
  });

  it('rejects a wrong-algorithm prefix even with a plausible-length digest', () => {
    const sha1Like = `sha1=${createHmac('sha256', SECRET).update(BODY).digest('hex')}`;
    expect(verifyGithubSignature(BODY, sha1Like, SECRET)).toBe(false);
  });

  it('rejects a non-hex digest', () => {
    expect(verifyGithubSignature(BODY, `sha256=${'z'.repeat(64)}`, SECRET)).toBe(false);
  });

  it('rejects uppercase hex (GitHub sends lowercase; the format is strict)', () => {
    const upper = sign(BODY, SECRET).toUpperCase().replace('SHA256=', 'sha256=');
    expect(verifyGithubSignature(BODY, upper, SECRET)).toBe(false);
  });

  it('rejects a too-short and a too-long header', () => {
    expect(verifyGithubSignature(BODY, 'sha256=deadbeef', SECRET)).toBe(false);
    expect(verifyGithubSignature(BODY, `sha256=${'a'.repeat(65)}`, SECRET)).toBe(false);
  });

  it('never throws on a multi-byte header whose string length looks valid', () => {
    // 71 UTF-16 code units but >71 bytes — would make a naive timingSafeEqual throw.
    const multibyte = `sha256=${'€'.repeat(64)}`;
    expect(() => verifyGithubSignature(BODY, multibyte, SECRET)).not.toThrow();
    expect(verifyGithubSignature(BODY, multibyte, SECRET)).toBe(false);
  });

  it('never throws on an empty header', () => {
    expect(() => verifyGithubSignature(BODY, '', SECRET)).not.toThrow();
    expect(verifyGithubSignature(BODY, '', SECRET)).toBe(false);
  });
});
