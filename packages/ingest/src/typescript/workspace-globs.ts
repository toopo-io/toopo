/**
 * Match a package directory against workspace globs (pnpm `packages:` or the
 * `package.json` `workspaces` field). A pure helper so the matching is testable
 * without a filesystem; the IO that finds package directories lives separately.
 *
 * Supported glob vocabulary covers what workspace configs actually use: `*` is
 * one path segment, `**` is any number, a literal pattern matches exactly, and a
 * leading `!` is an exclusion (a directory matched by an exclusion is never a
 * member, mirroring pnpm).
 */
export function matchesWorkspaceGlobs(dir: string, globs: readonly string[]): boolean {
  let included = false;
  for (const glob of globs) {
    const negated = glob.startsWith('!');
    const pattern = negated ? glob.slice(1) : glob;
    if (!globToRegExp(pattern).test(dir)) {
      continue;
    }
    if (negated) {
      return false; // an explicit exclusion wins outright
    }
    included = true;
  }
  return included;
}

/** Compile a workspace glob to an anchored RegExp (`*` = one segment, `**` = any). */
function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\/+$/, ''); // a trailing slash is insignificant for dirs
  let regex = '';
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === '*') {
      if (normalized[i + 1] === '*') {
        regex += '.*';
        i += 1;
      } else {
        regex += '[^/]+';
      }
    } else if ('\\^$+?.()|[]{}'.includes(char as string)) {
      regex += `\\${char}`;
    } else {
      regex += char;
    }
  }
  return new RegExp(`^${regex}$`);
}
