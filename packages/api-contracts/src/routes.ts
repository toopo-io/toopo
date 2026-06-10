// Canonical web route segments shared between backend and frontend.
//
// The backend uses these to build email URLs in
// `apps/api/src/modules/auth/email/url-builders.ts`. The frontend uses them
// from `apps/web/src/lib/routes.ts` to derive every `/${locale}/${segment}`
// path. Centralizing here gives us a single rename surface for product-facing
// URLs and prevents drift between the URL Better Auth emails and the page
// the frontend exposes — see ADR-0011 §Email URL ownership (B13) for why we
// own these URLs end-to-end.

export const ROUTE_SEGMENTS = {
  SIGNIN: 'signin',
  SIGNUP: 'signup',
  ACCOUNT: 'account',
  VERIFY_EMAIL: 'verify-email',
  FORGOT_PASSWORD: 'forgot-password',
  RESET_PASSWORD: 'reset-password',
  // The project picker — the instance's connected repos (ADR-0022 §5). The graph
  // explorer lives under a selected project: `/projects/:projectId/graph`.
  PROJECTS: 'projects',
  // The visual-cartography explorer (ADR-0020 read API; web-only — the backend
  // emails no link to it, but the page URL stays single-sourced like the rest).
  GRAPH: 'graph',
  // The GitHub-App post-install return page (ADR-0026 §5): GitHub's "Setup URL"
  // lands here, and the page completes the install against the API.
  CONNECT: 'connect',
} as const;

export type RouteSegment = (typeof ROUTE_SEGMENTS)[keyof typeof ROUTE_SEGMENTS];
