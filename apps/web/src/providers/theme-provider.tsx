'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * App-wide theme provider (Minimal design: light by default, persisted toggle).
 *
 * Theming is attribute-driven — next-themes writes `data-theme="light|dark"` on
 * the document element, which the shared token sheet keys off (see
 * tooling/tailwind/base.css). The choice is persisted to localStorage and applied
 * before paint by next-themes' injected script, so there is no flash and no
 * dependence on the OS `prefers-color-scheme`. `enableSystem` is off on purpose:
 * the product picks light as its calm default, and the user owns the switch.
 */
export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
