'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { JSX } from 'react';
import type { RepoSummary } from '../../lib/projects/mapped-status';
import { routes } from '../../lib/routes';

interface RepoListProps {
  readonly repos: readonly RepoSummary[];
  readonly locale: string;
}

/**
 * The sidebar repository list. Each row links to the repo's cartography. The
 * mapped state is deterministic (the package-map probe): a mapped repo carries a
 * quiet badge, an unmapped one says "not mapped yet" — never a guess, never a
 * fabricated star/file count (those are not deterministic Toopo data).
 */
export function RepoList({ repos, locale }: RepoListProps): JSX.Element {
  const t = useTranslations('AppShell');
  const params = useParams<{ projectId?: string }>();
  const activeId = params.projectId;

  return (
    <ul className="flex flex-col gap-0.5">
      {repos.map((repo) => {
        const active = repo.id === activeId;
        return (
          <li key={repo.id}>
            <Link
              href={routes.projectGraph(locale, repo.id) as Route}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-md border px-2.5 py-2 ${
                active ? 'border-line-strong bg-accent' : 'border-transparent hover:bg-accent'
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${
                  repo.mapped ? 'bg-certain' : 'bg-faint'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium font-mono text-[12.5px]">
                    {repo.repoName}
                  </span>
                  {repo.mapped ? (
                    <span className="rounded border border-border px-1.5 py-px font-mono text-[9px] text-muted-foreground">
                      {t('repo.mapped')}
                    </span>
                  ) : null}
                </span>
                {repo.mapped && repo.repoOwner === repo.repoName ? null : (
                  // The owner sub-line disambiguates the repo; when it merely
                  // repeats the name (a single-owner seed), drop it rather than
                  // echo the name twice.
                  <span className="mt-0.5 block truncate font-mono text-[10.5px] text-faint">
                    {repo.mapped ? repo.repoOwner : t('repo.notMapped')}
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
