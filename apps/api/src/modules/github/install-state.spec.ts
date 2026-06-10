import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { INSTALL_STATE_TTL_MS, signInstallState, verifyInstallState } from './install-state';

const SECRET = 'a-server-signing-secret-at-least-32-chars';
const NOW = new Date('2026-06-10T12:00:00Z');

/** Correctly sign an arbitrary body so the signature passes and the body is what is tested. */
function tokenForBody(rawBody: string): string {
  const body = Buffer.from(rawBody, 'utf8').toString('base64url');
  const sig = createHmac('sha256', SECRET).update(body).digest().toString('base64url');
  return `${body}.${sig}`;
}

describe('install state', () => {
  it('round-trips the bound user id within the TTL', () => {
    const token = signInstallState(SECRET, 'user-1', NOW);
    expect(verifyInstallState(SECRET, token, NOW)).toEqual({ userId: 'user-1' });
  });

  it('issues a unique token per call (nonce)', () => {
    expect(signInstallState(SECRET, 'user-1', NOW)).not.toBe(
      signInstallState(SECRET, 'user-1', NOW),
    );
  });

  it('rejects a tampered payload (forged user id)', () => {
    const token = signInstallState(SECRET, 'user-1', NOW);
    const forgedBody = Buffer.from(
      JSON.stringify({ u: 'attacker', t: NOW.getTime(), n: 'x' }),
    ).toString('base64url');
    const tampered = `${forgedBody}.${token.split('.')[1]}`;
    expect(verifyInstallState(SECRET, tampered, NOW)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = signInstallState(SECRET, 'user-1', NOW);
    expect(verifyInstallState(SECRET, `${token.split('.')[0]}.AAAA`, NOW)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signInstallState('other-secret-other-secret-other!', 'user-1', NOW);
    expect(verifyInstallState(SECRET, token, NOW)).toBeNull();
  });

  it('rejects an expired token (replay bound)', () => {
    const token = signInstallState(SECRET, 'user-1', NOW);
    const later = new Date(NOW.getTime() + INSTALL_STATE_TTL_MS + 1);
    expect(verifyInstallState(SECRET, token, later)).toBeNull();
  });

  it('accepts a token exactly at the TTL boundary', () => {
    const token = signInstallState(SECRET, 'user-1', NOW);
    const atBoundary = new Date(NOW.getTime() + INSTALL_STATE_TTL_MS);
    expect(verifyInstallState(SECRET, token, atBoundary)).toEqual({ userId: 'user-1' });
  });

  it('rejects a malformed token (wrong part count)', () => {
    expect(verifyInstallState(SECRET, 'no-dot', NOW)).toBeNull();
    expect(verifyInstallState(SECRET, 'a.b.c', NOW)).toBeNull();
  });

  it('rejects a correctly-signed body that is not valid JSON', () => {
    expect(verifyInstallState(SECRET, tokenForBody('not json'), NOW)).toBeNull();
  });

  it('rejects a correctly-signed body whose JSON shape is wrong', () => {
    expect(
      verifyInstallState(SECRET, tokenForBody(JSON.stringify({ foo: 'bar' })), NOW),
    ).toBeNull();
  });
});
