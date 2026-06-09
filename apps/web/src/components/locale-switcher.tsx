'use client';

import { type Locale, SUPPORTED_LOCALES } from '@toopo/i18n';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type ChangeEvent, type JSX, useTransition } from 'react';

export function LocaleSwitcher(): JSX.Element | null {
  const t = useTranslations('LocaleSwitcher');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  // The full multi-locale switcher is retained plumbing (ADR-0018). With a
  // single active locale there is nothing to switch, so render nothing — the
  // control auto-appears when a second locale is added to SUPPORTED_LOCALES.
  if (SUPPORTED_LOCALES.length <= 1) {
    return null;
  }

  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const next = event.target.value as Locale;
    const pathWithoutLocale = pathname.replace(new RegExp(`^/${locale}(?=/|$)`), '');
    const target = `/${next}${pathWithoutLocale === '' ? '' : pathWithoutLocale}`;
    startTransition(() => {
      router.replace(target);
    });
  };

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium">{t('label')}</span>
      <select
        value={locale}
        onChange={handleChange}
        className="rounded border bg-background px-2 py-1 text-sm"
        aria-label={t('label')}
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {t(`locale.${code}` as const)}
          </option>
        ))}
      </select>
    </label>
  );
}
