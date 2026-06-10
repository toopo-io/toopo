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
import { organization } from 'better-auth/plugins';

export const authAdditionalUserFields = {
  deletedAt: { type: 'date', required: false, input: false },
} as const;

export const authSchemaOptions = {
  user: { additionalFields: authAdditionalUserFields },
} as const satisfies Pick<BetterAuthOptions, 'user'>;

/** The full option object the organization plugin accepts. */
type OrganizationPluginOptions = NonNullable<Parameters<typeof organization>[0]>;

/**
 * Behavioral (NON schema-affecting) organization-plugin options Toopo sets at
 * runtime. Deliberately a narrow allowlist: every option here leaves the
 * generated DDL untouched, so the committed migration can never drift from the
 * running schema and stays the single source of truth (ADR-0017 §3). Anything
 * that WOULD change a table (teams, custom `schema`, additional fields) must be
 * fixed inside `buildOrganizationPlugin` instead, never passed through here.
 */
export interface OrganizationBehavior {
  /** Wired in Phase 4 to the fail-soft AuthEmailService (ADR-0028). */
  readonly sendInvitationEmail?: OrganizationPluginOptions['sendInvitationEmail'];
}

/**
 * The Better Auth organization plugin — Toopo's Workspace tenancy substrate
 * (ADR-0028: an `organization` IS a Workspace; the term is relabelled only at
 * the product/UI boundary, internals track Better Auth's schema verbatim).
 *
 * Constructed HERE so the schema-affecting configuration is fixed in one place
 * and shared verbatim by the maintainer-time migration generator and the
 * runtime auth factory (ADR-0017 §3). Only the behavioral options above vary
 * between the two call sites, and they never change the emitted tables — so the
 * generator and the running app always agree, and the CI drift-check holds.
 */
export function buildOrganizationPlugin(
  behavior: OrganizationBehavior = {},
): ReturnType<typeof organization> {
  return organization({ ...behavior });
}
