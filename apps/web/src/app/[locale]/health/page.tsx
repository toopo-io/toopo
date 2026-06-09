import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { apiClient } from '../../../lib/api-client';
import { HealthClient } from './health-client';

export const dynamic = 'force-dynamic';

interface HealthPageProps {
  params: Promise<{ locale: string }>;
}

export default async function HealthPage({ params }: HealthPageProps): Promise<ReactNode> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Health');
  const initialData = await apiClient.health(locale).catch(() => null);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      <HealthClient initialData={initialData} />
    </main>
  );
}
