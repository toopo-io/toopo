/**
 * The signed, session-bound install `state` (ADR-0026 §7) — the
 * install-hijack / CSRF defense for the GitHub-App redirect. At initiation the
 * server signs a token binding the initiating user id and an issue time under a
 * server secret; on return the token is verified and its user id MUST equal the
 * session user, so an attacker cannot craft a return URL that attaches their
 * installation to a victim's signed-in session.
 *
 * Stateless and HMAC-based (no server store): the signature binds the payload and
 * a short TTL bounds replay (ADR-0026 §7). Pure functions with an injected `now` —
 * no hidden clock — so the TTL boundary is asserted deterministically in tests.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** A signed state is valid for this long after issue (replay bound, ADR-0026 §7). */
export const INSTALL_STATE_TTL_MS = 600_000;

const StatePayloadSchema = z.object({
  /** The initiating (and, on return, the expected session) user id. */
  u: z.string().min(1),
  /** Issue time in epoch ms (TTL anchor). */
  t: z.number().int().nonnegative(),
  /** A nonce for uniqueness / log correlation. */
  n: z.string().min(1),
});

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

function sign(secret: string, body: string): string {
  return base64url(createHmac('sha256', secret).update(body).digest());
}

/** Issue a signed state token binding `userId` at `now`. */
export function signInstallState(secret: string, userId: string, now: Date): string {
  const payload = { u: userId, t: now.getTime(), n: randomUUID() };
  const body = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${body}.${sign(secret, body)}`;
}

/**
 * Verify a state token and return the bound user id, or `null` for any failure
 * (bad shape, forged/tampered signature, wrong secret, or expired). Never throws —
 * the caller maps `null` to a rejection without leaking which check failed.
 */
export function verifyInstallState(
  secret: string,
  token: string,
  now: Date,
): { userId: string } | null {
  const parts = token.split('.');
  const body = parts[0];
  const providedSig = parts[1];
  if (parts.length !== 2 || body === undefined || providedSig === undefined) {
    return null;
  }
  const expectedSig = sign(secret, body);
  const provided = Buffer.from(providedSig, 'utf8');
  const expected = Buffer.from(expectedSig, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = StatePayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    return null;
  }
  if (now.getTime() - parsed.data.t > INSTALL_STATE_TTL_MS) {
    return null;
  }
  return { userId: parsed.data.u };
}
