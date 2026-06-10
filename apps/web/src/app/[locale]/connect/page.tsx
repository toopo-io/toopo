import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { routes } from '../../../lib/routes';
import { getServerSession } from '../../../lib/server-session';
import { ConnectComplete } from './connect-complete';

// The post-install return (ADR-0026 §5): GitHub's "Setup URL" lands here with
// installation_id / setup_action / state. Rendered dynamically (it acts on the
// per-request query and session).
export const dynamic = 'force-dynamic';

interface ConnectPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    installation_id?: string;
    setup_action?: string;
    state?: string;
  }>;
}

export default async function ConnectPage({
  params,
  searchParams,
}: ConnectPageProps): Promise<ReactNode> {
  const { locale } = await params;
  setRequestLocale(locale);
  // Gate the return on a signed-in session (ADR-0026 §7): the install is always
  // bound to a Toopo user. An anonymous return bounces to sign-in and back.
  const session = await getServerSession();
  if (session === null) {
    redirect(routes.signinNext(locale, routes.connect(locale)));
  }

  const query = await searchParams;
  return (
    <ConnectComplete
      locale={locale}
      installationId={query.installation_id ?? null}
      setupAction={query.setup_action ?? null}
      state={query.state ?? null}
    />
  );
}
