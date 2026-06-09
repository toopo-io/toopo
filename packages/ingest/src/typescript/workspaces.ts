import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildWorkspacePackages, type WorkspacePackageInput } from '@toopo/lang-react';
import type { WorkspacePackage } from '@toopo/resolver';
import { fdir } from 'fdir';
import { parse as parseYaml } from 'yaml';
import { directoryOf, HARD_DEFAULT_DIRS, toPosix } from '../internal/paths.js';
import { matchesWorkspaceGlobs } from './workspace-globs.js';

const PACKAGE_JSON = 'package.json';
const PNPM_WORKSPACE = 'pnpm-workspace.yaml';

/**
 * Discover the project's workspace packages and map them to the resolver's
 * `{ name, entry }` model (ADR-0016 Fork 2b). IO lives here; the entry-resolution
 * convention is the pure `buildWorkspacePackages` in `lang-react` (F-D). The
 * source-entry probe is the injected `fileExists` over the analyzed set, so a
 * package whose source is not analyzed is dropped rather than guessed.
 *
 * Both layouts are supported: pnpm's `pnpm-workspace.yaml` `packages:` globs and
 * the `package.json` `workspaces` field (array or `{ packages: [...] }`). A
 * single-package project (neither present) yields no workspace packages.
 */
export async function loadWorkspacePackages(
  rootDir: string,
  fileExists: (repoRelativePath: string) => boolean,
): Promise<WorkspacePackage[]> {
  // Resolve to absolute: fdir's withRelativePaths() collapses to basenames on a
  // bare relative crawl root, and readFile must target the right directory.
  const base = resolve(rootDir);
  const globs = await readWorkspaceGlobs(base);
  if (globs.length === 0) {
    return [];
  }

  const crawled = await new fdir()
    .withRelativePaths()
    .exclude((dirName) => HARD_DEFAULT_DIRS.has(dirName))
    .filter((path) => isPackageJson(path))
    .crawl(base)
    .withPromise();

  const inputs: WorkspacePackageInput[] = [];
  for (const path of crawled.map(toPosix)) {
    const dir = directoryOf(path);
    if (dir === '' || !matchesWorkspaceGlobs(dir, globs)) {
      continue;
    }
    const input = await readPackageInput(base, path, dir);
    if (input !== undefined) {
      inputs.push(input);
    }
  }
  return buildWorkspacePackages(inputs, fileExists);
}

/** Read workspace globs from pnpm-workspace.yaml, else the package.json field. */
async function readWorkspaceGlobs(rootDir: string): Promise<string[]> {
  const pnpm = await readOptionalFile(`${rootDir}/${PNPM_WORKSPACE}`);
  if (pnpm !== undefined) {
    const parsed = parseYaml(pnpm) as { packages?: unknown };
    return stringArray(parsed?.packages);
  }
  const pkg = await readOptionalFile(`${rootDir}/${PACKAGE_JSON}`);
  if (pkg !== undefined) {
    const workspaces = (JSON.parse(pkg) as { workspaces?: unknown }).workspaces;
    if (Array.isArray(workspaces)) {
      return stringArray(workspaces);
    }
    if (isRecord(workspaces)) {
      return stringArray((workspaces as { packages?: unknown }).packages);
    }
  }
  return [];
}

/** Read one workspace package.json into a builder input, or undefined if unnamed. */
async function readPackageInput(
  rootDir: string,
  path: string,
  dir: string,
): Promise<WorkspacePackageInput | undefined> {
  const parsed = JSON.parse(await readFile(`${rootDir}/${path}`, 'utf8')) as {
    name?: unknown;
    main?: unknown;
    module?: unknown;
    types?: unknown;
    exports?: unknown;
  };
  if (typeof parsed.name !== 'string') {
    return undefined; // an unnamed package cannot be the target of a bare import
  }
  const main = asString(parsed.main);
  const moduleField = asString(parsed.module);
  const types = asString(parsed.types);
  const exports = isRecord(parsed.exports) ? parsed.exports : undefined;
  // Omit absent keys rather than assigning undefined (exactOptionalPropertyTypes).
  return {
    name: parsed.name,
    dir,
    ...(main !== undefined && { main }),
    ...(moduleField !== undefined && { module: moduleField }),
    ...(types !== undefined && { types }),
    ...(exports !== undefined && { exports }),
  };
}

/** Read a file, returning undefined when it does not exist (rethrowing otherwise). */
async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function isPackageJson(path: string): boolean {
  return (
    path === PACKAGE_JSON || path.endsWith(`/${PACKAGE_JSON}`) || path.endsWith(`\\${PACKAGE_JSON}`)
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}
