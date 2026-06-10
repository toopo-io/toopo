/**
 * Minimal, `.passthrough()` schemas for the GitHub-App `installation` and
 * `installation_repositories` webhook events (ADR-0026 §3, ADR-0006). Like the
 * push schema, only the fields the handler acts on are modeled, so GitHub adding
 * fields never breaks the receiver. Repos arrive as `full_name` (`owner/name`);
 * {@link splitFullName} is the single place that splits them.
 */
import type { InstallationRepo } from '@toopo/github-app';
import { z } from 'zod';

const RepoRefSchema = z
  .object({
    name: z.string().trim().min(1),
    full_name: z.string().trim().min(1),
  })
  .passthrough();

const InstallationRefSchema = z
  .object({
    id: z.number().int().positive(),
    account: z
      .object({ login: z.string().trim().min(1) })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** The `installation` event (created / deleted / suspend / unsuspend). */
export const InstallationEventSchema = z
  .object({
    action: z.string().trim().min(1),
    installation: InstallationRefSchema,
    repositories: z.array(RepoRefSchema).optional(),
  })
  .passthrough();
export type InstallationEvent = z.infer<typeof InstallationEventSchema>;

/** The `installation_repositories` event (added / removed). */
export const InstallationRepositoriesEventSchema = z
  .object({
    action: z.string().trim().min(1),
    installation: InstallationRefSchema,
    repositories_added: z.array(RepoRefSchema).optional(),
    repositories_removed: z.array(RepoRefSchema).optional(),
  })
  .passthrough();
export type InstallationRepositoriesEvent = z.infer<typeof InstallationRepositoriesEventSchema>;

/**
 * Split a repo `full_name` (`owner/name`) into the {@link InstallationRepo} the
 * provisioning seam expects, or `null` when it is not exactly `owner/name`.
 */
export function splitFullName(fullName: string): InstallationRepo | null {
  const slash = fullName.indexOf('/');
  if (slash <= 0 || slash === fullName.length - 1) {
    return null;
  }
  return { owner: fullName.slice(0, slash), name: fullName.slice(slash + 1) };
}
