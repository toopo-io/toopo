/**
 * The GitHub-App connect contract (ADR-0026 §2–§3, §6), shared FE/BE as one source
 * of truth (ADR-0006). Initiation returns the redirect URL; completion carries the
 * post-install signal (installation id, the optional `setup_action`, and the
 * signed session-bound `state`) and reports how many projects were connected.
 */
import { z } from 'zod';

/** `GET /v1/github/install` → the GitHub App install redirect URL. */
export const InstallUrlResponseSchema = z.object({ url: z.string().url() }).strict();
export type InstallUrlResponse = z.infer<typeof InstallUrlResponseSchema>;

/**
 * `POST /v1/github/install/complete` body. The installation id is the numeric
 * string GitHub returns on the redirect; `state` is the signed token issued at
 * initiation (verified against the session — ADR-0026 §7); `setupAction` is
 * GitHub's `setup_action` (`install` / `update`).
 */
export const CompleteInstallRequestSchema = z
  .object({
    installationId: z.string().regex(/^\d+$/, 'installationId must be a numeric string'),
    setupAction: z.string().min(1).optional(),
    state: z.string().min(1),
  })
  .strict();
export type CompleteInstallRequest = z.infer<typeof CompleteInstallRequestSchema>;

/** `POST /v1/github/install/complete` → the link result + repos connected. */
export const CompleteInstallResponseSchema = z
  .object({
    linked: z.boolean(),
    projectsConnected: z.number().int().nonnegative(),
  })
  .strict();
export type CompleteInstallResponse = z.infer<typeof CompleteInstallResponseSchema>;
