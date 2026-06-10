/**
 * The domain record for a GitHub-App installation (ADR-0026 §3) and the Zod
 * boundary parse that normalizes a raw row (ADR-0006, ADR-0017 §10). Timestamps
 * cross two backends with different runtime types (`Date` vs ISO string), coerced
 * here so callers see one camelCase shape; the snake_case→camelCase mapping mirrors
 * {@link rowToProject}.
 */
import { z } from 'zod';
import type { GithubInstallationTable } from '../schema/project-types.js';

const dbDate = z.coerce.date();

/** The installation_id ⇄ owner_user_id link recorded by the install redirect. */
export const GithubInstallationRecordSchema = z.object({
  installationId: z.string(),
  ownerUserId: z.string(),
  createdAt: dbDate,
  updatedAt: dbDate,
});
export type GithubInstallationRecord = z.infer<typeof GithubInstallationRecordSchema>;

type GithubInstallationRowLike = {
  readonly installation_id: string;
  readonly owner_user_id: string;
  readonly created_at: GithubInstallationTable['created_at'];
  readonly updated_at: GithubInstallationTable['updated_at'];
};

/** Map a snake_case installation row to a validated camelCase record. */
export function rowToGithubInstallation(row: GithubInstallationRowLike): GithubInstallationRecord {
  return GithubInstallationRecordSchema.parse({
    installationId: row.installation_id,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
