/**
 * The project-persistence surface apps depend on (ADR-0017 §1, fork F4: the app
 * never touches Kysely; ADR-0022). `createProjectDatabase` builds a connection
 * and hands back a {@link ProjectRepository} plus a close function, mirroring
 * {@link createGraphDatabase} and {@link createAuthDatabase}. The backend
 * (SQLite self-host / Postgres cloud) is selected by the DATABASE_URL scheme.
 *
 * `db` and `backend` are exposed for the explicit migrate step only — never to
 * migrate on boot (ADR-0008). Runtime callers use `projectRepository` alone.
 */
import type { Kysely } from 'kysely';
import type { DatabaseBackend } from './config.js';
import { createDatabase } from './database.js';
import type { GithubInstallationRepository } from './repositories/github-installation.repository.js';
import { KyselyGithubInstallationRepository } from './repositories/github-installation.repository.kysely.js';
import type { ProjectRepository } from './repositories/project.repository.js';
import { KyselyProjectRepository } from './repositories/project.repository.kysely.js';
import type { ProjectDatabase } from './schema/project-types.js';

export interface ProjectDatabaseHandle {
  readonly projectRepository: ProjectRepository;
  /** The GitHub-App installation link store (ADR-0026 §3), same connection. */
  readonly githubInstallationRepository: GithubInstallationRepository;
  /** The resolved backend — for an explicit `migrateToLatest` step. */
  readonly backend: DatabaseBackend;
  /** The underlying connection — for `migrateToLatest` only, never on boot. */
  readonly db: Kysely<ProjectDatabase>;
  /** Closes the underlying connection (call on shutdown). */
  close(): Promise<void>;
}

export function createProjectDatabase(input: unknown): ProjectDatabaseHandle {
  const handle = createDatabase<ProjectDatabase>(input);
  return {
    projectRepository: new KyselyProjectRepository(handle.db),
    githubInstallationRepository: new KyselyGithubInstallationRepository(handle.db),
    backend: handle.backend,
    db: handle.db,
    close: () => handle.db.destroy(),
  };
}
