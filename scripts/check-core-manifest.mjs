/**
 * Core manifest assertion — the external-dependency half of ADR-0015 the import
 * graph cannot see (dependency-cruiser checks imports, not package.json). Part of
 * the dependency-boundary gate (Verification gate #5): packages/core must declare
 * ZERO runtime dependencies and may list ONLY `zod` as a peer dependency. Any
 * drift fails the gate.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED_PEERS = ['zod'];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(repoRoot, 'packages', 'core', 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const runtimeDeps = Object.keys(manifest.dependencies ?? {});
const peerDeps = Object.keys(manifest.peerDependencies ?? {});
const unexpectedPeers = peerDeps.filter((name) => !ALLOWED_PEERS.includes(name));

const errors = [];
if (runtimeDeps.length > 0) {
  errors.push(`must have zero runtime dependencies; found: ${runtimeDeps.join(', ')}`);
}
if (!peerDeps.includes('zod')) {
  errors.push('must declare `zod` as a peer dependency');
}
if (unexpectedPeers.length > 0) {
  errors.push(
    `may only peer-depend on ${ALLOWED_PEERS.join(', ')}; found extra: ${unexpectedPeers.join(', ')}`,
  );
}

if (errors.length > 0) {
  console.error('✗ core manifest assertion failed (ADR-0015 — packages/core):');
  for (const message of errors) {
    console.error(`  - packages/core ${message}`);
  }
  process.exit(1);
}

process.stdout.write('✓ core manifest assertion passed (zero runtime deps; zod peer only).\n');
