# ADR 0014: Internal route URLs — single source of truth

Date: 2026-05-17
Status: Accepted

## Context

The TOOPO web app and API both build URLs that point at the web app's
own pages. The frontend builds them for `<Link href>`, `router.push`,
the proxy auth-guard redirect, and Better Auth `callbackURL` /
`redirectTo`. The backend builds them too: `apps/api/src/modules/auth
/email/url-builders.ts` constructs the URL Better Auth embeds in
verification and password-reset emails (see ADR-0011 §Email URL
ownership). Phase 4.1.8 audit found 22 hardcoded
`/${locale}/{route}` occurrences across 11 frontend files, alongside
two hardcoded segments on the backend side — every rename was a
multi-file diff with a real risk of drift between the URL that
arrives in a user's inbox and the page the frontend exposes.

## Decision

Two single-source-of-truth modules, layered:

1. **`packages/api-contracts/src/routes.ts`** exports `ROUTE_SEGMENTS`,
   a typed constants object mapping each route key (`SIGNIN`,
   `ACCOUNT`, `VERIFY_EMAIL`, …) to its kebab-case URL segment
   (`signin`, `account`, `verify-email`, …). This is the cross-package
   shared layer. The backend email URL builder imports it directly.
2. **`apps/web/src/lib/routes.ts`** wraps `ROUTE_SEGMENTS` into typed
   helpers: `routes.signin(locale)`, `routes.verifyEmailWithEmail
   (locale, email)`, `absoluteRoutes.account(origin, locale)`, plus a
   `protectedPathPrefixes` array consumed by `proxy.helpers.ts`. The
   helpers handle locale prefixing, query-param building, and
   `encodeURIComponent` so call sites never assemble URLs manually.

Every internal URL the web app builds must come from `routes`,
`absoluteRoutes`, or `protectedPathPrefixes`. Literal
`/${locale}/signin` strings in components are a lint-by-eye violation.

This follows the same single-source-of-truth philosophy as
[ADR-0006](0006-zod-as-single-source-of-truth.md) for wire schemas
and [ADR-0009](0009-i18n-strategy.md) for translation keys.

## Consequences

- Renaming a route (e.g. `signin` → `login`) is a one-file change in
  `packages/api-contracts/src/routes.ts`. The TypeScript compiler
  catches any forgotten consumer.
- Backend email URLs and frontend page paths cannot drift — they
  share the same canonical segment constant. The B13 risk
  (`api.example.com` showing up in user inboxes) is impossible by
  construction once route segments come from the shared module.
- New protected sections only need one line added to
  `protectedPathPrefixes` in `routes.ts` to opt into the proxy auth
  guard. See [ADR-0011](0011-authentication-strategy.md) §Protected
  paths and the whitelist model.
- Trade-off: one extra import per page/form. Acceptable given the
  rename surface and FE/BE alignment we gain.

## Alternatives considered

- **Frontend-only `routes.ts`, hardcode segments on the backend**:
  cheaper to set up but leaves the FE/BE drift surface that B13
  exposed.
- **Generate routes from a Next.js manifest**: brittle (build-time
  artifact, locale-prefix semantics not expressed) and forces a build
  before the backend can resolve a route name.
- **Inline literals + lint rule**: catches drift but adds a custom
  Biome rule no one wants to maintain.

## Related ADRs

- [ADR-0006](0006-zod-as-single-source-of-truth.md) — same SSOT
  pattern, for wire schemas.
- [ADR-0009](0009-i18n-strategy.md) — locale-prefix routing
  (`localePrefix: 'always'`), the layer this ADR builds on.
- [ADR-0011](0011-authentication-strategy.md) §Email URL ownership
  — the B13 fix that exposed the centralization need.
