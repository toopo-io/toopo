import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppShell } from '../../../components/shell/app-shell';
import { forwardedCookieHeader } from '../../../lib/cookie-header';
import { graphApi } from '../../../lib/graph/api';
import { listMyProjects } from '../../../lib/projects/api';
import { isProjectMapped, type RepoSummary } from '../../../lib/projects/mapped-status';
import { routes } from '../../../lib/routes';
import { getServerSession } from '../../../lib/server-session';
import { listMyWorkspaces } from '../../../lib/workspaces/api';

// Membership-scoped, reflects out-of-band connects + the live mapped state.
export const dynamic = 'force-dynamic';

interface ProjectsLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

/**
 * The shell layout for the whole project surface (Phase C1). Gates the surface
 * behind a session (defense-in-depth + the return path, ADR-0022 §5), then loads
 * the workspaces (the picker) and the caller's repos (the sidebar), tagging each
 * with its deterministic mapped state. The standalone project grid folds into the
 * sidebar — the page below renders only the main surface.
 */
export default async function ProjectsLayout({
  children,
  params,
}: ProjectsLayoutProps): Promise<ReactNode> {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getServerSession();
  if (session === null) {
    redirect(routes.signinNext(locale, routes.projects(locale)));
  }

  const init = { headers: { cookie: await forwardedCookieHeader() } };
  const [workspaces, projectPage] = await Promise.all([
    listMyWorkspaces(init),
    listMyProjects(locale, init).catch(() => null),
  ]);
  // TODO(perf, MEDIUM-1): this fans one package-map probe per repo to derive the
  // mapped state — an N+1 acceptable at v1's repo counts. The durable fix is a
  // persisted `mapped` column on the project, set at ingest, read in one query.
  const repos = await Promise.all(
    (projectPage?.items ?? []).map((project) => toRepoSummary(project, locale, init)),
  );

  // The active Workspace is the session's active organization (ADR-0028), not the
  // first in the list — otherwise a multi-workspace viewer sees the wrong one.
  const activeWorkspaceId = session.session.activeOrganizationId ?? workspaces[0]?.id ?? null;

  return (
    <AppShell
      workspaces={workspaces}
      repos={repos}
      activeWorkspaceId={activeWorkspaceId}
      locale={locale}
    >
      {children}
    </AppShell>
  );
}

async function toRepoSummary(
  project: { id: string; repoOwner: string; repoName: string },
  locale: string,
  init: RequestInit,
): Promise<RepoSummary> {
  // The mapped state is the package-map probe (decision ①): one row, not the graph.
  const map = await graphApi
    .map(project.id, { level: 'package', limit: 1 }, locale, init)
    .catch(() => null);
  return {
    id: project.id,
    repoOwner: project.repoOwner,
    repoName: project.repoName,
    mapped: map !== null && isProjectMapped(map),
  };
}
