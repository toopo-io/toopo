/**
 * Parse the worker CLI arguments (pure, unit-testable). The single positional is
 * the directory to ingest (an optional leading `ingest` subcommand is accepted,
 * matching `toopo-worker ingest <dir>`); the database URL comes from
 * `--database-url` or, when omitted, the `DATABASE_URL` env. A missing directory
 * or database URL throws with the usage line.
 */
import { parseArgs as nodeParseArgs } from 'node:util';
import { DatabaseUrlSchema } from '@toopo/db';

/** The default project owner for CLI-populated graphs (ADR-0022 §1, §2): the
 *  worker has no session, so the connect is attributed to a system principal
 *  unless `--owner-user-id` is given. `owner_user_id` is a logical reference
 *  (no FK), recorded for provenance and the future cloud isolation rule. */
const DEFAULT_OWNER_USER_ID = 'system';

/* `--workspace-id` is MANDATORY (ADR-0028): the worker has no session, so it
 * cannot resolve a user's workspace the way the install flow does (Phase 2). It
 * attributes the project to a workspace it is GIVEN, and that workspace must
 * already exist — a missing or unreal one would silently produce a project no one
 * can reach under membership-scoped access (Phase 3). There is deliberately NO
 * default: existence is validated at ingest time, not papered over with a
 * sentinel. `owner_user_id` is provenance only (no FK) and keeps its default. */

export interface WorkerCliOptions {
  readonly rootDir: string;
  readonly databaseUrl: string;
  readonly gitignore: boolean;
  /** The connected repo this graph is persisted under (ADR-0022 §3). */
  readonly repo: {
    readonly host: string;
    readonly owner: string;
    readonly name: string;
  };
  /** The user the project is attributed to on first connect. */
  readonly ownerUserId: string;
  /** The workspace the project is attributed to on first connect (ADR-0028). */
  readonly workspaceId: string;
}

const USAGE =
  'Usage: toopo-worker ingest <dir> --database-url <url> \\\n' +
  '         --repo-host <host> --repo-owner <owner> --repo-name <name> \\\n' +
  '         --workspace-id <id> [--owner-user-id <id>] [--no-gitignore]\n' +
  '  (DATABASE_URL env is used when --database-url is omitted; the repo triple\n' +
  '   resolves-or-creates the project the graph is scoped to, ADR-0022; the\n' +
  '   workspace must already exist — the worker cannot create one, ADR-0028)';

export function parseArgs(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>> = {},
): WorkerCliOptions {
  const { values, positionals } = nodeParseArgs({
    args: [...args],
    allowPositionals: true,
    options: {
      'database-url': { type: 'string' },
      'repo-host': { type: 'string' },
      'repo-owner': { type: 'string' },
      'repo-name': { type: 'string' },
      'owner-user-id': { type: 'string' },
      'workspace-id': { type: 'string' },
      'no-gitignore': { type: 'boolean' },
    },
  });

  const rest = positionals[0] === 'ingest' ? positionals.slice(1) : positionals;
  const rootDir = rest[0];
  if (rootDir === undefined) {
    throw new Error(USAGE);
  }

  // The shared boundary schema (ADR-0006): presence AND a scheme the dialect
  // layer accepts, so a typo fails here with usage help instead of deeper in.
  const parsedUrl = DatabaseUrlSchema.safeParse(values['database-url'] ?? env['DATABASE_URL']);
  if (!parsedUrl.success) {
    throw new Error(`A valid database URL is required (--database-url or DATABASE_URL).\n${USAGE}`);
  }
  const databaseUrl = parsedUrl.data;

  const host = values['repo-host'];
  const owner = values['repo-owner'];
  const name = values['repo-name'];
  if (
    host === undefined ||
    host.length === 0 ||
    owner === undefined ||
    owner.length === 0 ||
    name === undefined ||
    name.length === 0
  ) {
    throw new Error(
      `The repo coordinates are required (--repo-host, --repo-owner, --repo-name).\n${USAGE}`,
    );
  }

  const workspaceId = values['workspace-id'];
  if (workspaceId === undefined || workspaceId.length === 0) {
    throw new Error(`A workspace id is required (--workspace-id).\n${USAGE}`);
  }

  return {
    rootDir,
    databaseUrl,
    gitignore: values['no-gitignore'] !== true,
    repo: { host, owner, name },
    ownerUserId: values['owner-user-id'] ?? DEFAULT_OWNER_USER_ID,
    workspaceId,
  };
}
