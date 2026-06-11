import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@toopo/ui/components/card';
import type { Route } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { listMyProjects } from '../../../lib/projects/api';
import { routes } from '../../../lib/routes';
import { getServerSession } from '../../../lib/server-session';
import { ConnectRepositoryButton } from './connect-repository-button';

// The project list reflects out-of-band connects; render dynamically.
export const dynamic = 'force-dynamic';

interface ProjectsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function ProjectsPage({ params }: ProjectsPageProps): Promise<ReactNode> {
  const { locale } = await params;
  setRequestLocale(locale);
  // Gate the picker behind auth (ADR-0022 §5): the middleware redirects an
  // anonymous request; this server check is defense-in-depth + the return path.
  const session = await getServerSession();
  if (session === null) {
    redirect(routes.signinNext(locale, routes.projects(locale)));
  }

  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join('; ');
  const page = await listMyProjects(locale, { headers: { cookie: cookieHeader } }).catch(
    () => null,
  );
  const projects = page?.items ?? [];

  return (
    <main className="mx-auto flex max-w-screen-lg flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Pick a connected repository to open its cartography.
          </p>
        </div>
        {projects.length > 0 ? <ConnectRepositoryButton /> : null}
      </header>

      {projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>
              Connect a repository to populate its graph, then it will appear here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectRepositoryButton />
          </CardContent>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={routes.projectGraph(locale, project.id) as Route}
                className="block transition-colors hover:border-primary"
              >
                <Card className="h-full hover:border-primary">
                  <CardHeader>
                    <CardTitle className="text-base">
                      {project.repoOwner}/{project.repoName}
                    </CardTitle>
                    <CardDescription>{project.repoHost}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
