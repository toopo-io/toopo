#!/usr/bin/env node
/**
 * The consume-mode process entrypoint (a thin shell — logic lives in
 * {@link startConsume}). Reads the database URL from the environment, starts the
 * consumer, and installs graceful-shutdown on SIGINT/SIGTERM so a deploy stop or
 * Ctrl-C drains the in-flight job before exiting. The DB must already be migrated
 * (`db:migrate`, ADR-0008).
 */
import { DatabaseUrlSchema } from '@toopo/db';
import { startConsume } from './consume.js';

// The same boundary schema the api validates with (ADR-0006): presence AND a
// scheme the dialect layer accepts, failing fast with the canonical message.
const parsedUrl = DatabaseUrlSchema.safeParse(process.env['DATABASE_URL']);
if (!parsedUrl.success) {
  const reason = parsedUrl.error.issues[0]?.message ?? 'DATABASE_URL is not set';
  process.stderr.write(`worker consumer: ${reason}\n`);
  process.exit(1);
}

const handle = startConsume({ databaseUrl: parsedUrl.data });

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  process.stderr.write(`\n[worker] ${signal} received, draining…\n`);
  try {
    await handle.shutdown();
    process.exit(0);
  } catch (error) {
    process.stderr.write(
      `[worker] shutdown error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
