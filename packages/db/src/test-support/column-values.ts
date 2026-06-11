/**
 * Backend-correct column values for tests (ADR-0017 §6). Postgres stores a real
 * boolean; SQLite/libSQL stores 0/1. Seeding a boolean column (e.g. `emailVerified`)
 * needs the right shape per backend — this is the single source for that mapping,
 * so the scattered `backend === 'postgres' ? true : 1` ternary lives in one place.
 *
 * Not shipped: test-support only, excluded from the build and from coverage.
 */
import type { DatabaseBackend } from '../config.js';

/** A boolean as the backend stores it: a real boolean on Postgres, 0/1 on SQLite. */
export function dbBoolean(backend: DatabaseBackend, value: boolean): boolean | number {
  return backend === 'postgres' ? value : value ? 1 : 0;
}
