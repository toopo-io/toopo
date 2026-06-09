'use client';

import { useQuery } from '@tanstack/react-query';
import type { HealthCheckResponse } from '@toopo/api-contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@toopo/ui/components/card';
import { useLocale, useTranslations } from 'next-intl';
import type { JSX } from 'react';
import { apiClient } from '../../../lib/api-client';

const HEALTH_REFRESH_SECONDS = 10;

interface HealthClientProps {
  initialData: HealthCheckResponse | null;
}

export function HealthClient({ initialData }: HealthClientProps): JSX.Element {
  const t = useTranslations('Health');
  const locale = useLocale();

  const { data, isFetching, error } = useQuery<HealthCheckResponse>({
    queryKey: ['health', locale],
    queryFn: () => apiClient.health(locale),
    refetchInterval: HEALTH_REFRESH_SECONDS * 1000,
    refetchIntervalInBackground: false,
    ...(initialData !== null ? { initialData } : {}),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('currentStatus')}</CardTitle>
        <CardDescription>
          {isFetching ? t('refreshing') : t('pollingEvery', { seconds: HEALTH_REFRESH_SECONDS })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">
            {t('failedToLoad', {
              message: error instanceof Error ? error.message : t('unknownError'),
            })}
          </p>
        ) : data ? (
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t('fields.status')}</dt>
            <dd className="font-medium">{data.status}</dd>
            <dt className="text-muted-foreground">{t('fields.version')}</dt>
            <dd className="font-mono">{data.version}</dd>
            <dt className="text-muted-foreground">{t('fields.uptime')}</dt>
            <dd className="font-mono">{data.uptime.toFixed(2)}s</dd>
            <dt className="text-muted-foreground">{t('fields.timestamp')}</dt>
            <dd className="font-mono">{data.timestamp}</dd>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">{t('noData')}</p>
        )}
      </CardContent>
    </Card>
  );
}
