# Security Policy

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities, and
please do not disclose an issue publicly before a fix is available — give us
the chance to protect self-hosters first.

- **Primary path:** GitHub's **"Report a vulnerability"** (Private
  Vulnerability Reporting) on the repository's
  [Security tab](https://github.com/toopo-io/toopo/security/advisories/new).
- **Fallback** (if you cannot use GitHub): email
  **passepartouffe@gmail.com** with `[toopo security]` in the subject.

Please include a description of the issue and its impact, reproduction steps
or a proof-of-concept, and any suggested remediation.

For general (non-security) questions, use
[GitHub Issues](https://github.com/toopo-io/toopo/issues).

## What to expect

- **Acknowledgement within 48 hours.** Toopo is maintained by one person, so
  triage beyond the acknowledgement may take a few days — you will not be left
  without a response.
- A coordinated disclosure timeline (typically 30–90 days) agreed once a fix
  is available.
- Credit in the advisory once published, if you wish.

## Scope

**In scope** — the Toopo monorepo:

- The deterministic engine (`packages/parser`, `packages/resolver`,
  `packages/ingest`, `packages/serve`, `packages/db`, `packages/queue`,
  `packages/github-app`, and the other `packages/*`).
- The API (`apps/api`), including authentication, workspace/membership
  authorization, and the GitHub-App connect flow.
- The worker (`apps/worker`), including the hardened clone path and the
  handling of untrusted repository content.
- The GitHub webhook receiver and its signature gate.
- The self-host deployment templates (`docker/`, `docker-compose*.yml`).

**Out of scope:**

- Vulnerabilities in the repositories Toopo *analyses*. Toopo treats analysed
  repo content as untrusted input; a finding about a third-party repo belongs
  upstream. (A way for an analysed repo to attack the Toopo worker or API is
  very much **in** scope.)
- Issues in third-party dependencies — report upstream first; we track and
  patch downstream.

## Security primitives worth knowing

- **The webhook signature gate is load-bearing.** Every GitHub webhook is
  verified (HMAC-SHA256 over the raw body, constant-time) *before any
  processing*; with no secret configured the endpoint fails closed (503). A
  bypass of this gate is a high-severity finding.
- Analysed repository content is **read, parsed, and never executed**; clones
  run in a per-job sandbox with a hardened `git` environment, and credentials
  reach `git` only through `GIT_ASKPASS` — never argv, URLs, or logs.
- Graph access is membership-scoped: the workspace is read from the persisted
  project, never from the request.

## Known accepted residual

On a **multi-user instance**, a freshly-installed GitHub App installation that
its owner has not yet completed linking can, within a narrow window, be
claimed by another authenticated user who guesses the installation id (ADR-0026
amendment, 2026-06-13). Already-linked installations cannot be taken over
(cross-owner relink is rejected), and a single-user self-host is not affected.
Closing this residual entirely — GitHub identity verification at link time —
is a required gate before any multi-user hosted deployment.
