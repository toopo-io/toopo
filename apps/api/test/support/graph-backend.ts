/**
 * Seeds a real, migrated graph database for the Serve API e2e (ADR-0020 Phase C).
 * Everything comes from @toopo/db's public surface (fork F4 — no Kysely here):
 * createGraphDatabase + migrateToLatest + persistGraph. The returned handle's
 * `graphRepository` is the value the e2e overrides GRAPH_REPOSITORY with, so the
 * booted app serves this seeded graph.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { GraphDocument } from '@toopo/core';
import {
  createGraphDatabase,
  type GraphDatabaseHandle,
  MIGRATIONS_DIR,
  migrateToLatest,
} from '@toopo/db';

export interface SeededGraph {
  readonly handle: GraphDatabaseHandle;
  cleanup(): Promise<void>;
}

/** Create a temp SQLite graph DB, migrate it, and persist `document` into it. */
export async function seedGraphDatabase(document: GraphDocument): Promise<SeededGraph> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'toopo-serve-e2e-'));
  const file = path.join(dir, 'graph.db').split(path.sep).join('/');
  const handle = createGraphDatabase({ databaseUrl: `file:${file}` });
  await migrateToLatest({ db: handle.db, backend: handle.backend, rootDir: MIGRATIONS_DIR });
  await handle.graphRepository.persistGraph(document);
  return {
    handle,
    async cleanup() {
      await handle.close();
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        /* best-effort temp cleanup */
      }
    },
  };
}
