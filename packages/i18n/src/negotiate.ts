import { match } from '@formatjs/intl-localematcher';
import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from './locales.js';

export interface NegotiateLocaleOptions {
  /**
   * Explicit locale candidate taking priority over `Accept-Language`. Used to
   * propagate the URL-active locale (e.g. `x-toopo-locale` header) so an
   * explicit user choice wins over the implicit browser preference. Invalid
   * or unsupported values fall through silently to `Accept-Language` parsing.
   */
  readonly override?: string | null;
}

interface WeightedTag {
  readonly tag: string;
  readonly q: number;
}

const TAG_PATTERN = /^[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8})*$/;
const Q_PATTERN = /^q=([0-9](?:\.[0-9]+)?)$/;

function parseAcceptLanguage(header: string): WeightedTag[] {
  const tags: WeightedTag[] = [];
  for (const part of header.split(',')) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const [rawTag, ...params] = trimmed.split(';').map((segment) => segment.trim());
    if (rawTag === undefined || rawTag.length === 0 || rawTag === '*') continue;
    if (!TAG_PATTERN.test(rawTag)) continue;
    let q = 1;
    for (const paramPart of params) {
      const matched = Q_PATTERN.exec(paramPart);
      if (matched === null) continue;
      const captured = matched[1];
      if (captured === undefined) continue;
      const value = Number(captured);
      if (Number.isFinite(value) && value >= 0 && value <= 1) {
        q = value;
      }
    }
    if (q > 0) {
      tags.push({ tag: rawTag, q });
    }
  }
  return tags.slice().sort((a, b) => b.q - a.q);
}

/**
 * Pure, locale-set-agnostic core of the Accept-Language negotiation. Generic
 * over the supported set and default locale so the full algorithm (q-value
 * ordering, fallback, override validation, malformed-tag handling) can be
 * exercised against a fixture locale set in tests even while production ships
 * a single active locale. `negotiateLocale` binds this to the shipped
 * `SUPPORTED_LOCALES` — see ADR-0018.
 */
export function negotiateLocaleFrom<L extends string>(
  acceptLanguage: string | null | undefined,
  supported: readonly L[],
  defaultLocale: L,
  options?: NegotiateLocaleOptions,
): L {
  const override = options?.override;
  if (typeof override === 'string' && (supported as readonly string[]).includes(override)) {
    return override as L;
  }
  if (typeof acceptLanguage !== 'string' || acceptLanguage.trim().length === 0) {
    return defaultLocale;
  }
  const tags = parseAcceptLanguage(acceptLanguage);
  if (tags.length === 0) {
    return defaultLocale;
  }
  try {
    const matched = match(
      tags.map((entry) => entry.tag),
      [...supported],
      defaultLocale,
    );
    return matched as L;
  } catch {
    return defaultLocale;
  }
}

/**
 * Negotiate the active locale for a request from its `Accept-Language` header
 * and optional explicit override, bound to the shipped `SUPPORTED_LOCALES`.
 */
export function negotiateLocale(
  acceptLanguage: string | null | undefined,
  options?: NegotiateLocaleOptions,
): Locale {
  return negotiateLocaleFrom(acceptLanguage, SUPPORTED_LOCALES, DEFAULT_LOCALE, options);
}
