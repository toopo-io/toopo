'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { type JSX, useEffect, useState } from 'react';

const OPTIONS = [
  { value: 'light', glyph: '☀' },
  { value: 'dark', glyph: '☾' },
] as const;

/**
 * The light/dark segmented control (Minimal design). Persisted by next-themes.
 * The active segment is only resolved after mount — before hydration the theme is
 * unknown, so rendering it on the server would risk a mismatch; until then no
 * segment is marked active (the control still renders, stable markup).
 */
export function ThemeToggle(): JSX.Element {
  const t = useTranslations('AppShell');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <fieldset
      className="m-0 flex min-w-0 rounded-md border border-border bg-secondary p-0.5"
      aria-label={t('theme.toggle')}
    >
      {OPTIONS.map((option) => {
        const active = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 font-mono text-[11px] transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span aria-hidden="true">{option.glyph}</span>
            {t(`theme.${option.value}`)}
          </button>
        );
      })}
    </fieldset>
  );
}
