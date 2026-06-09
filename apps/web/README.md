# @toopo/web

Toopo web app — Next.js 16 App Router, React 19, Tailwind 4.

## Stack

- **Next.js 16** with React Server Components by default.
- **Tailwind 4** via `@tailwindcss/postcss` (CSS-first config; design tokens in
  `@toopo/tailwind-config/base.css`).
- **shadcn/ui** components imported from `@toopo/ui`.
- **TanStack Query 5** for server-state caching and interval refetching.
- **React Hook Form 7** + `@hookform/resolvers/zod` for forms (schemas reused
  from `@toopo/api-contracts`).
- **Locale routing**: `next-intl` 4 with `defineRouting` and
  `createMiddleware` mounted at `src/proxy.ts`. URLs are always
  prefixed (`/en/…`). First visits are negotiated from
  `Accept-Language`. Locale set sourced from `@toopo/i18n` so adding
  a locale is a one-place change.

## Internationalization

Messages live as ICU-format JSON catalogs under
`src/i18n/messages/<locale>.json` (`en.json` today — English is the
only active locale, see ADR-0018). `src/i18n/request.ts`
dynamic-imports the active locale so only its strings ship to the
browser. Type-safety is provided by `src/i18n/messages.d.ts` — a
missing or misspelled key is a compile error.

- **Server components** use `getTranslations('section')` /
  `setRequestLocale(locale)`.
- **Client components** use `useTranslations('section')` /
  `useLocale()`.
- **Locale switcher**: `src/components/locale-switcher.tsx` swaps the
  URL's locale prefix inside a `useTransition` so navigation is
  non-blocking. It renders nothing while a single locale is active
  (ADR-0018) and reappears automatically when a second is added.
- **Zod errors on the client**: `src/components/zod-locale-config.tsx`
  re-installs `z.config({ customError })` on every locale change so
  form validation messages follow the current locale without a full
  reload. Translation keys mirror the API's catalog so client and
  server emit the same text.
- **API errors**: the api-client forwards `Accept-Language: ${locale}`
  and parses `ErrorResponseSchema` on non-OK responses. The rendered
  `response.message` is already in the user's locale — the form
  displays it directly.

See [ADR-0009](../../docs/adr/0009-i18n-strategy.md) for the full
strategy.

### Adding a locale

1. Add the code to `SUPPORTED_LOCALES` in
   `packages/i18n/src/locales.ts`.
2. Create `apps/web/src/i18n/messages/<code>.json` mirroring
   `en.json`'s structure.
3. Create `apps/api/src/i18n/locales/<code>.json` mirroring its
   `en.json`.
4. Rebuild.

## Run locally

```bash
cp .env.example .env.local
pnpm install
pnpm --filter @toopo/web dev
```

Web app listens on `http://localhost:3000` and expects the API at
`NEXT_PUBLIC_API_URL` (default `http://localhost:4000`).

The home page is `GET /en`. The health demo is `GET /en/health` — it
SSR-fetches the API once and then keeps the data fresh with TanStack Query,
refetching on a fixed interval.

## Environment variables

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | `'development' \| 'production' \| 'test'` | `development` | Runtime mode |
| `LOG_LEVEL` | `'debug' \| 'info' \| 'warn' \| 'error'` | `info` | Client log level |
| `NEXT_PUBLIC_API_URL` | URL | — | Toopo API base URL |
| `NEXT_PUBLIC_AUTH_URL` | URL | — | Better Auth base URL (kept separate for future subdomain split) |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | string | `en` | Default locale for the redirect |
| `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` | `'true' \| 'false'` | `false` | Explicit toggle for the Google sign-in button (server `GOOGLE_CLIENT_ID` is not visible to the browser) |

## Authentication

Phase 4 added five auth pages under `app/[locale]/(auth)/`:

- `/signin` — email + password, conditional Google button
- `/signup` — name + email + password
- `/forgot-password` — email input, sends reset link
- `/reset-password?token=…` — new password input
- `/verify-email?email=…` — pending state + resend button

Plus `/account` (read-only profile with sign-out, data-export, and
soft-delete actions).

Architecture:

- `src/lib/auth-client.ts` — `createAuthClient` from `better-auth/react`
  pointing at `${NEXT_PUBLIC_AUTH_URL}/v1/auth`.
- `src/lib/auth-schemas.ts` — client-side Zod schemas for form
  validation (Better Auth re-validates server-side).
- `src/lib/server-session.ts` — server-side helper that forwards
  request cookies to `/v1/auth/get-session` for SSR pages.
- `src/proxy.ts` — Next 16 middleware. Cookie-existence gate redirects
  unauthenticated users from protected paths to `/{locale}/signin`.
  Public paths: `/`, `/health`, `/signin`, `/signup`,
  `/forgot-password`, `/reset-password`, `/verify-email`.

See [ADR-0011](../../docs/adr/0011-authentication-strategy.md) for the
full strategy and [ADR-0013](../../docs/adr/0013-rgpd-compliance.md)
for the data-export + soft-delete posture surfaced on `/account`.

## Conventions

### `next-env.d.ts` is gitignored

This file is **intentionally** excluded from version control (root `.gitignore`),
overriding Next.js's default recommendation to commit it. Reason: it is
auto-regenerated by `next dev` / `next build` and the dev/build path
alternation produces phantom diffs on every branch switch.
