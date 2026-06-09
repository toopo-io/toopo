# ADR 0009: i18n strategy

Date: 2026-05-15
Status: Accepted — partially superseded by ADR-0018 (active-locale set only)

## Context

TOOPO ships to French and English customers from day one. Every
user-facing string in `apps/web` and every error message returned by
`apps/api` must surface in the user's locale. The pipeline must work
without JavaScript (server fallback) and feel instant with JavaScript
(client-side validation, locale switch without full reload).

## Decision

Three libraries, one shared package:

- **`@toopo/i18n`** (new package): the canonical locale set —
  `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `isSupportedLocale`,
  `resolveLocaleFromPath`, and `negotiateLocale`. The negotiator uses
  `@formatjs/intl-localematcher` and falls back to `DEFAULT_LOCALE` on
  empty, `*`, or malformed `Accept-Language` headers. Build-distributed
  per ADR-0004 so `apps/api` (CJS) can consume it from `dist/`.
- **`next-intl` 4.12** on `apps/web`: routing via `defineRouting` +
  `createMiddleware` (the Next 16 `proxy.ts` convention is supported
  natively — `export default createMiddleware(routing)`). Locale comes
  from the URL prefix (`/en/…`, `/fr/…`), negotiated from
  `Accept-Language` on the first visit. SSR uses `getTranslations`,
  client components use `useTranslations`. Messages live as ICU-format
  JSON catalogs under `src/i18n/messages/{en,fr}.json` and are
  dynamic-imported by `src/i18n/request.ts` so only the active locale
  ships to the browser.
- **`i18next` 26.2** on `apps/api`: resources are **embedded at
  compile time** as `.ts` modules under `src/i18n/locales/{en,fr}.ts`
  (no `i18next-fs-backend`, no `.json` imports — see ADR-0010 for
  why). A `LocaleInterceptor` reads `Accept-Language`,
  calls `@toopo/i18n.negotiateLocale`, attaches the resolved locale to
  the Fastify request, and sets `Content-Language` on the reply. The
  `GlobalExceptionFilter` consults `request.locale` and translates Zod
  issues + transport errors via an injected `I18nService`.

### Locale negotiation priority

The API resolves the request locale by consulting these signals in order
(first supported value wins; unsupported/missing values fall through):

1. **`x-toopo-locale` header** — explicit URL-active locale propagated by
   the frontend on every Better Auth call (see
   `apps/web/src/lib/auth-client.ts`, `onRequest` hook). Represents an
   **explicit user choice**: the user is currently on `/en/...` or
   `/fr/...` and that segment is the strongest signal of which locale
   they want content (notably email bodies) in.
2. **`Accept-Language` header** — implicit browser preference. Used when
   no URL-driven override is available (e.g. server-to-server probes,
   unauthenticated requests outside a localized page) or when the
   override is an unsupported tag.
3. **`DEFAULT_LOCALE` (`en`)** — final fallback when both signals are
   absent or unsupported.

`negotiateLocale(acceptLanguage, { override })` in `@toopo/i18n`
implements the cascade. The `override` is validated against
`isSupportedLocale`; unknown tags are ignored silently so the
header is forward-compatible (the frontend may send any string;
unsupported values do not poison the negotiation).

The same cascade is used everywhere a request-scoped locale is needed:
`LocaleInterceptor` (for `request.locale` → exception filter messages and
`Content-Language` response header), Better Auth email handlers
(`sendVerificationEmail`, `sendResetPassword`), and the auth bridge's
canonical error envelope. This keeps server-rendered text consistent
with the locale the user sees in the URL even when their browser
preference disagrees.

A future user-level locale preference persisted in the database would
slot in as priority **0** (above the URL override), so a signed-in user
gets their saved preference even if they navigate to a URL in a
different locale. Deferred — see Phase 4.1.9 / Phase 5 backlog.

### Error contract

Errors are wire-locale-agnostic. `@toopo/api-contracts` defines:

- `ErrorCode` — a small fixed enum (`VALIDATION_FAILED`, `NOT_FOUND`,
  `UNAUTHORIZED`, etc.) that is **never** translated.
- `ErrorResponseSchema.params?: Record<string, string | number |
  boolean>` — interpolation values for the catalog template
  (`{minimum}`, `{maximum}`, `{path}`, …).
- `ErrorResponseSchema.message: string` — the rendered, locale-
  specific human text. Pre-rendered by the server for the locale the
  client asked for, so the frontend can display it without consulting
  a second translation catalog.

`PollingIntervalSchema` (and any future schema) is **stripped of
embedded English** at the source of truth. The schema enforces shape;
text is the filter's job.

### Type safety (Q4)

Both sides use TypeScript declaration merging so a misspelled key is
a compile error:

- `apps/web/src/i18n/messages.d.ts` —
  `declare global { type IntlMessages = typeof en }` so next-intl's
  `useTranslations('section.key')` is keyed against the en catalog.
- `apps/api/src/i18n/i18n.types.ts` —
  `declare module 'i18next' { interface CustomTypeOptions { resources:
  { translation: ApiCatalog } } }` (where `ApiCatalog = typeof en`
  comes from the `.ts` source-of-truth catalog) so i18next's
  `t('errors.…')` is keyed against the en catalog. The api side
  additionally constrains `fr.ts` against `CatalogShape<ApiCatalog>`
  (from `@toopo/i18n`) so the two locales cannot diverge structurally.

A change in the en source-of-truth catalog propagates to every
caller's type-checker on the next build.

### Client-side Zod localization

`apps/web` mounts `ZodLocaleConfig` inside `NextIntlClientProvider`.
On every locale change, it re-runs
`z.config({ customError: errorMap(useTranslations) })` so client-side
form validation produces the **current** locale's text — not the boot
locale. A user switching from `/en` to `/fr` and triggering a Zod
error sees French immediately, without a full page reload.

Both sides share the same dispatch — `apps/api/src/i18n/zod-issue.
translator.ts` and `apps/web/src/i18n/zod-error-map.ts` emit identical
keys/params from Zod issue codes (`too_small`, `too_big`,
`invalid_type` with `expected: 'int'` → `not_integer`).

## Consequences

- Adding a locale is configuration: extend `SUPPORTED_LOCALES` in
  `@toopo/i18n`, add `messages/<code>.json` on `apps/web`, add
  `locales/<code>.ts` on `apps/api`. No application-code changes.
  The asymmetry (`.json` on web, `.ts` on api) is structural —
  Next.js bundles JSON natively, NestJS+swc does not. See
  [ADR-0010](0010-asset-bundling-strategy.md).
- Adding a new translation key requires changes in four files
  (api en `.ts`, api fr `.ts`, web en `.json`, web fr `.json`).
  Type-safety guarantees compile errors if a key is used but missing.
- The fallback policy is **explicit**: a missing key in `fr` falls
  back to `en` (next-intl's and i18next's default with `fallbackLng:
  'en'`). A missing key in `en` returns the key path itself — surfaced
  immediately in dev.
- The `ErrorResponse.message` round-trips server-translated text. The
  frontend renders it directly; no translation step on the client for
  server errors. This keeps the wire stable when locales evolve
  asymmetrically.
- Embedded `.ts` catalogs on `apps/api` mean translations are baked
  into the build artifact. To roll out new translations, you ship a
  new build. At our scale (2 locales, ~10 keys), this is a feature,
  not a limitation. ADR-0010 captures the asset-loading rule that
  underpins this design.

## Alternatives considered

- **`i18next-fs-backend` on the API**: blocked by the swc-builder
  asset-copy gap; see ADR-0010.
- **`.json` catalogs on the API via `import en from './locales/en.json'`**:
  shipped in the original Phase 3 cut. Broken at runtime — `swc`
  preserves the `require('./locales/en.json')` call but does not
  inline JSON, and the JSON file never reaches `dist/`. Replaced
  with `.ts` modules in Phase 3.5. Recorded here so future
  contributors don't reintroduce it on the assumption that
  `resolveJsonModule: true` is sufficient. See ADR-0010.
- **`react-i18next` on the web**: works, but the Next.js App Router
  story is rougher than `next-intl`'s. `next-intl` is built for App
  Router and ships native typed routing helpers.
- **Single shared catalog**: tempting, but the web needs UI strings
  the API never sees (`Home.title`, `PollingForm.applying`), and the
  API needs operational strings the web never sees. Sharing only the
  `errors.validation.*` subtree was considered; the duplication cost
  is two short JSON files, the coupling cost would have been higher.
- **Translate on the client only**: would require the client to
  duplicate the API's full error key catalog. Round-tripping the
  rendered string keeps that catalog single-sourced.
