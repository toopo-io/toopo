'use client';

import { Button } from '@toopo/ui/components/button';
import { useLocale } from 'next-intl';
import { type JSX, useState } from 'react';
import { getInstallUrl } from '../../../lib/github/api';

/**
 * Starts the GitHub-App connect flow (ADR-0026 §2, §5): fetch the signed install
 * URL from the API and redirect the browser to GitHub. The API returns 503 when no
 * App is configured (self-host without a GitHub App) — surfaced as a clear hint
 * rather than a dead button.
 */
export function ConnectRepositoryButton(): JSX.Element {
  const locale = useLocale();
  const [isConnecting, setIsConnecting] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleConnect = async (): Promise<void> => {
    setIsConnecting(true);
    setFailed(false);
    try {
      const { url } = await getInstallUrl(locale);
      window.location.href = url;
    } catch {
      setFailed(true);
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={handleConnect} disabled={isConnecting} className="self-start">
        {isConnecting ? 'Connecting…' : 'Connect a repository'}
      </Button>
      {failed ? (
        <p className="text-destructive text-sm">
          Could not start the connect flow. Is a GitHub App configured on this instance?
        </p>
      ) : null}
    </div>
  );
}
