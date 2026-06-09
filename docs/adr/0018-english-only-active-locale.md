# ADR 0018: English-only active locale; i18n machinery retained

Date: 2026-06-08
Status: Accepted
Supersedes: ADR-0009 (in part — active-locale set only)

## Context

Toopo was forked from a bilingual (en/fr) product. ADR-0009 established an
en+fr i18n stack. Toopo's audience is developers and the project constitution
(CLAUDE.md) mandates English-only for all text. Maintaining a second product
language is no longer warranted — but the i18n *infrastructure* (locale
negotiation, URL-prefix routing, typed catalogs, the four-file discipline) is
exemplary, well-tested plumbing we keep so adding a language later stays a
config-only change.

## Decision

1. English is the only ACTIVE locale: `SUPPORTED_LOCALES = ['en']`,
   `DEFAULT_LOCALE = 'en'`.
2. Remove French as active content: delete the web `fr.json`, the api `fr.ts`
   catalog, and the two French email templates; drop `fr` from the i18n service
   resources and the email template maps; remove the unused `LocaleSwitcher`
   `fr` label.
3. RETAIN the full multi-locale machinery: `@toopo/i18n` (negotiator, path
   resolver, catalog types), `next-intl` routing, `i18next` wiring, the locale
   switcher, and the typed-catalog discipline. Adding a language remains a
   config-only change, exactly as ADR-0009 described. The `LocaleSwitcher`
   renders nothing while a single locale is active and re-appears automatically
   when a second locale is added.
4. Preserve negotiator coverage with a fixture locale: extract a pure,
   parametrized core `negotiateLocaleFrom(acceptLanguage, supported,
   defaultLocale, options)`; `negotiateLocale` binds it to the shipped locale
   set. The negotiation algorithm (q-values, fallback, override, malformed
   tags) is tested against a two-locale fixture set, so coverage of the generic
   logic is unchanged while only one language ships.

## Consequences

- ADR-0009's bilingual claims ("French and English from day one", four-file-
  per-key, fr fallback examples) are superseded here. Its *architecture*
  (library choices, negotiation cascade, typed catalogs, error contract)
  remains in force; only the active-locale set changes.
- The locale switcher renders a single option — none, by design — until a
  second locale is added.
- Re-adding any language is config-only, no code edits — the original ADR-0009
  promise, now demonstrated by the retained machinery + fixture tests.
- Tests updated with no net coverage loss (see Decision 4): the api locale
  interceptor and exception-filter specs assert single-locale resolution while
  the negotiation algorithm's multi-locale behaviour is covered by the
  fixture-set suite in `@toopo/i18n`.

## Alternatives considered

- Keep en+fr: rejected — contradicts the English-only constitution.
- Single locale, delete negotiator tests: rejected — loses genuine-
  infrastructure coverage; violates "tests are part of done".
- Ship a fake second locale to keep tests "real": rejected — it would surface
  in the switcher and the message loader; the fixture-in-tests approach keeps
  production honest.
