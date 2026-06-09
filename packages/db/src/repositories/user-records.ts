/**
 * Domain records returned by the UserRepository, plus the Zod schemas that
 * normalize raw rows at the storage boundary (ADR-0006, ADR-0017 §10). Reads
 * cross from two backends with different runtime types — `Date` vs ISO string,
 * `boolean` vs `0|1` — and are coerced here so callers see one clean shape
 * regardless of backend.
 *
 * Field selection follows ADR-0013: the export omits session tokens and all
 * account credential material.
 */
import { z } from 'zod';

const dbDate = z.coerce.date();
const dbBoolean = z.union([z.boolean(), z.number(), z.bigint()]).transform(Boolean);

/** User record for the RGPD data export (Art. 15) — no credentials. */
export const UserRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: dbBoolean,
  image: z.string().nullable(),
  createdAt: dbDate,
  updatedAt: dbDate,
});
export type UserRecord = z.infer<typeof UserRecordSchema>;

/** Session record for the export — token bytes omitted. */
export const SessionRecordSchema = z.object({
  id: z.string(),
  expiresAt: dbDate,
  createdAt: dbDate,
  updatedAt: dbDate,
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
});
export type SessionRecord = z.infer<typeof SessionRecordSchema>;

/** Account record for the export — password hash and tokens omitted. */
export const AccountRecordSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  accountId: z.string(),
  createdAt: dbDate,
  updatedAt: dbDate,
});
export type AccountRecord = z.infer<typeof AccountRecordSchema>;
