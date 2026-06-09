import { Pool } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema/index.js';

export interface CreateDbOptions {
  readonly databaseUrl: string;
}

export type Schema = typeof schema;
export type Db = NeonDatabase<Schema>;

export function createDb(options: CreateDbOptions): Db {
  const url = options.databaseUrl.trim();
  if (url.length === 0) {
    throw new Error('createDb: databaseUrl must not be empty');
  }
  const pool = new Pool({ connectionString: url });
  return drizzle({ client: pool, schema });
}
