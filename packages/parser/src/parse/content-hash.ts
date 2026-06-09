import { createHash } from 'node:crypto';

/**
 * The file content hash (ADR-0015 §10, ADR-0016 Fork 5): `sha256` over the RAW
 * file bytes via Node's built-in `crypto`, hex-encoded. The algorithm lives
 * here in the parser, never in `@toopo/core` — core only mandates an opaque,
 * non-empty string. Hashing the bytes (not decoded text) keeps the hash a pure
 * function of the file's exact contents.
 */
export function hashContent(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
