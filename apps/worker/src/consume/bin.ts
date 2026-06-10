#!/usr/bin/env node
/**
 * The consume-mode process entrypoint (a thin shell — logic lives in
 * {@link startConsume}). Reads the database URL from the environment, starts the
 * consumer, and installs graceful-shutdown on SIGINT/SIGTERM so a deploy stop or
 * Ctrl-C drains the in-flight job before exiting. The DB must already be migrated
 * (`db:migrate`, ADR-0008).
 */
import { startConsume } from './consume.js';

const databaseUrl = process.env['DATABASE_URL'];
if (databaseUrl === undefined || databaseUrl.trim() === '') {
  process.stderr.write('DATABASE_URL is required to start the worker consumer\n');
  process.exit(1);
}

const handle = startConsume({ databaseUrl });

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
