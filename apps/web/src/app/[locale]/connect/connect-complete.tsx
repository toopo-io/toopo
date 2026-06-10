'use client';

import { buttonVariants } from '@toopo/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@toopo/ui/components/card';
import type { Route } from 'next';
import Link from 'next/link';
import { type JSX, useEffect, useRef, useState } from 'react';
import { completeInstall } from '../../../lib/github/api';
import { routes } from '../../../lib/routes';

type Status = 'invalid' | 'working' | 'done' | 'error';

interface ConnectCompleteProps {
  readonly locale: string;
  readonly installationId: string | null;
  readonly setupAction: string | null;
  readonly state: string | null;
}

/**
 * Completes the install against the API on mount (ADR-0026 §5): verify the state,
 * link the installation, provision repos. Runs once (a ref guards React strict-mode
 * double-invoke); a missing installation id / state is an invalid return.
 */
export function ConnectComplete(props: ConnectCompleteProps): JSX.Element {
  const hasState = props.installationId !== null && props.state !== null;
  const [status, setStatus] = useState<Status>(hasState ? 'working' : 'invalid');
  const [connected, setConnected] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || props.installationId === null || props.state === null) {
      return;
    }
    started.current = true;
    completeInstall(
      {
        installationId: props.installationId,
        state: props.state,
        ...(props.setupAction !== null ? { setupAction: props.setupAction } : {}),
      },
      props.locale,
    )
      .then((result) => {
        setConnected(result.projectsConnected);
        setStatus('done');
      })
      .catch(() => {
        setStatus('error');
      });
  }, [props.installationId, props.state, props.setupAction, props.locale]);

  return (
    <main className="mx-auto flex max-w-screen-sm flex-col gap-6 px-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle>{titleFor(status)}</CardTitle>
          <CardDescription>{descriptionFor(status, connected)}</CardDescription>
        </CardHeader>
        {status === 'done' || status === 'error' || status === 'invalid' ? (
          <CardContent>
            <Link className={buttonVariants()} href={routes.projects(props.locale) as Route}>
              Go to your projects
            </Link>
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}

function titleFor(status: Status): string {
  switch (status) {
    case 'working':
      return 'Connecting your repositories…';
    case 'done':
      return 'Repositories connected';
    case 'invalid':
      return 'Invalid connect link';
    default:
      return 'Connection failed';
  }
}

function descriptionFor(status: Status, connected: number): string {
  switch (status) {
    case 'working':
      return 'Linking the installation and starting the first scan.';
    case 'done':
      return `${connected} ${connected === 1 ? 'repository is' : 'repositories are'} now connected — their cartography is building.`;
    case 'invalid':
      return 'This page is the GitHub App setup return and needs an installation id and state.';
    default:
      return 'We could not complete the install. Please retry the connect flow from your projects.';
  }
}
