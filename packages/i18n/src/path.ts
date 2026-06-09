import { isSupportedLocale, type Locale } from './locales.js';

export function resolveLocaleFromPath(pathname: string): Locale | undefined {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const first = segments[0];
  if (first === undefined) {
    return undefined;
  }
  return isSupportedLocale(first) ? first : undefined;
}
