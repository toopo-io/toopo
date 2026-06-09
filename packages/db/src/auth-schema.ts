/**
 * Schema-affecting Better Auth options — the SINGLE source for anything that
 * changes the generated auth tables (ADR-0017 §3). Both the maintainer-time
 * migration generator (`compileAuthMigrationSql`) and the runtime auth factory
 * (apps/api) spread these, so the committed migrations and the running schema
 * can never disagree.
 *
 * `deletedAt` is the RGPD soft-delete field (ADR-0013), reattached as a Better
 * Auth field extension rather than a fork of the canonical schema. `input:
 * false` keeps it out of the public sign-up/update surface — only our
 * UserService writes it. Better Auth emits the column; the secondary index
 * (`user_deletedAt_idx`) is a follow-up migration because additionalFields do
 * not generate indexes.
 *
 * NOTE: any future plugin or field that adds/changes a table MUST be added
 * here (not only in the runtime factory), or the generated migration drifts
 * from the running schema. The CI drift-check guards this.
 */
import type { BetterAuthOptions } from 'better-auth';

export const authAdditionalUserFields = {
  deletedAt: { type: 'date', required: false, input: false },
} as const;

export const authSchemaOptions = {
  user: { additionalFields: authAdditionalUserFields },
} as const satisfies Pick<BetterAuthOptions, 'user'>;
