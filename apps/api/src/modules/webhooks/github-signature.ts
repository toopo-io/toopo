/**
 * The signature gate's pure core (ADR-0024 §1). GitHub signs the webhook with
 * `X-Hub-Signature-256: sha256=<hex>`, the HMAC-SHA256 of the raw request body
 * under the shared secret. Verification must be over the EXACT raw bytes (a
 * re-serialized body would not match) and constant-time on the digest compare.
 *
 * This function is total — it returns `false` for any missing, malformed, or
 * mismatched signature and NEVER throws, including on a hostile header whose
 * UTF-16 length looks valid but whose byte length would make `timingSafeEqual`
 * throw. The strict `sha256=<64 lowercase hex>` shape is validated first (a
 * format check leaks nothing secret), so both compared buffers are guaranteed
 * to be the same fixed ASCII byte length before the timing-safe compare.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** The only signature shape GitHub sends: `sha256=` + 64 lowercase hex chars. */
const SIGNATURE_PATTERN = /^sha256=[0-9a-f]{64}$/;

/**
 * Returns true iff `signatureHeader` is the HMAC-SHA256 of `rawBody` under
 * `secret`, in GitHub's `sha256=<hex>` form. Total and constant-time on the
 * digest; never throws.
 */
export function verifyGithubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (signatureHeader === undefined || !SIGNATURE_PATTERN.test(signatureHeader)) {
    return false;
  }
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  // Both are `sha256=` + 64 ASCII hex chars = 71 bytes, so the buffers are
  // equal-length and timingSafeEqual cannot throw.
  return timingSafeEqual(Buffer.from(signatureHeader, 'utf8'), Buffer.from(expected, 'utf8'));
}
