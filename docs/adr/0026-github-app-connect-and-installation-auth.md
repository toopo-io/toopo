# ADR 0026: GitHub-App connect — install→project flow, installation tokens, private clone

Date: 2026-06-10
Status: Accepted

Extends ADR-0022 (project tenancy — this names the install flow as the production
project creator the ADR deferred), ADR-0024 (the push-webhook contract — this adds
`installation*` events behind the same signature gate and keeps push
resolve-existing-only), and ADR-0025 (the worker clone — this supplies the
installation token its private-repo case deferred). Supersedes nothing; edits none
of them.

## Context

ADR-0024 closes a push into a live graph, but only for an already-connected repo:
its resolve-existing-only rule leaves project creation to "the install/connect
flow (B5)", because a webhook has neither an owner user nor an installation id and
must never fabricate tenancy. ADR-0025 clones the repo at a commit, but its
hardened `git` spawn has no credential, so private repos cannot clone. This ADR is
that connect flow: a signed-in user installs a GitHub App on their repos → projects
are created → the first scan runs → pushes flow through the existing loop, private
repos included. The constraints are unchanged: **OSS-first self-host** (no shared
hosted App — each self-hoster registers their own), the **trust principle** (never
fabricate an owner), and **graceful degradation** (no App configured ⇒ the
deterministic core still runs).

## Decision

1. **Per-owner App; credentials are env, optional, validated where used,
   fail-closed.** App id, base64 private key, client id/secret, slug; the webhook
   secret is ADR-0024's `GITHUB_WEBHOOK_SECRET`, reused. Unset ⇒ the connect
   endpoints return `503` and the worker stays public-clone-only — a missing App
   never blocks boot or touches the deterministic core (extends ADR-0024 §3).

2. **The install flow is the sole production creator of projects.** It resolves the
   ADR-0022 §5 / ADR-0024 §5 deferral. The consume path never creates; the populate
   CLI's resolve-or-create stays a local-dev convenience only.

3. **The installation is a first-class entity** (`github_installation`:
   installation id ↔ owner user). The post-install redirect is the *only*
   user-bearing signal; the `installation` / `installation_repositories` webhooks
   are the *authoritative* repo list but carry no Toopo user. Reconciliation is
   idempotent and order-independent (the unique repo index coalesces creates); a
   webhook for an installation with no recorded owner acks `200` and creates
   nothing — never fabricate an owner (symmetric to ADR-0024's resolve-existing).

4. **`@octokit/auth-app` for crypto, our guard for webhooks.** It mints the App JWT
   and mints+caches short-lived per-installation tokens, inside a new
   `packages/github-app` consumed by api and worker. Webhook verification stays
   ADR-0024's `GithubSignatureGuard`; `App.webhooks`/`createNodeMiddleware` is
   **rejected** — it duplicates the gate and bypasses the Nest guard/DI chain.

5. **The installation token closes ADR-0025's private-repo gap.** Minted per job
   (project → installation id → token), it reaches the cloner through a `0600`
   in-sandbox `GIT_ASKPASS` script — never in argv, the remote URL, a git ref, or a
   log. URL-embedding and `http.extraHeader` are **rejected** (token leaks).

6. **First scan on connect.** Resolve the default-branch HEAD sha via the
   installation client and enqueue one job, dedupe-coalesced (`${projectId}:${sha}`)
   with the first real push — no double scan.

7. **Lifecycle and hardening.** Uninstall / repo-removed **soft-archives** the
   project (nullable `archived_at`, filtered from the picker): the graph is
   preserved and reinstall is reversible. A signed, session-bound `state` on the
   redirect is **mandatory** (install-hijack / CSRF defense). The private key is
   supplied base64-encoded and decoded at the env boundary (multiline `.env`
   values are fragile).

## Consequences

- Onboarding closes end-to-end: connect → project → first scan → live cartography,
  private repos included.
- New surface: `packages/github-app`, the `github_installation` table + the
  `archived_at` column, five optional env vars — all behind the fail-closed gate.
- The webhook handler grows two event families; the push path is untouched.
- Accepted debt, each with a trigger: uninstall→**purge** (hard delete + graph) and
  a manual delete-project affordance wait on the hosted/multi-tenant privacy need;
  GitHub user-OAuth during install (admin verification) waits on a real need —
  the installation token already grants repo access without it.

## Alternatives considered

- **`App.webhooks` middleware.** Rejected (Decision 4): duplicates the ADR-0024
  gate, bypasses Nest guards/DI.
- **URL-embedded token / `http.extraHeader`.** Rejected (Decision 5): the token
  leaks into process argv, git refs, and error strings.
- **Webhook as project creator.** Rejected (Decision 3): it has no owner user;
  creating tenancy there fabricates ownership and skips the install flow.
- **Hard delete on uninstall.** Rejected for v1 (Decision 7): destroys history and
  is irreversible; revisit when hosted privacy demands purge.

## Amendment — 2026-06-13 (security pass): the no-re-point rule, its residual, and the pre-multi-user gate

The Phase ① security audit found that Decision 7's signed `state` defends only
half of the install-hijack surface: it binds the *session user* to *an* install
flow, but nothing binds it to *that installation*. The completion endpoint took
`installationId` verbatim from the client, and the link upsert re-pointed an
existing `owner_user_id` — so any authenticated user could claim an arbitrary
(sequential, enumerable) installation id, list its private repos with the App
JWT, and have the worker clone another user's private source into their own
workspace.

1. **The no-re-point rule (built).** `linkInstallation` replaces the unconditional
   upsert: the owner guard lives in the statement itself
   (`ON CONFLICT DO UPDATE … WHERE owner_user_id` matches the caller — portable on
   both backends, no read-then-write race). A link held by a different user is
   never re-pointed; the caller gets `409` and nothing downstream runs (no repo
   listing, no provisioning, no scan). Same-owner re-install stays idempotent;
   the id frees up only when the real `installation.deleted` webhook removes the
   link (Decision 7's soft-archive path). The connect flow is additionally
   throttled per IP, which slows enumeration.

2. **The honest residual.** A *never-linked* installation — freshly installed,
   its owner's return redirect not yet completed — can still be claimed by an
   attacker who guesses its id inside the 10-minute state TTL and wins the race
   against the legitimate owner, **on an instance with more than one user
   account**. There is no deterministic server-side proof available to close
   this today: sign-in carries no GitHub identity, and GitHub's redirect does not
   cryptographically bind `installation_id` to our `state`. A single-user
   self-host (the v1 target) is not affected. The residual is disclosed in
   SECURITY.md.

3. **GitHub identity verification is a REQUIRED gate before multi-user hosting**
   — not open-ended debt. Before toopo.io (or any deployment) is opened to
   multiple user accounts: add a GitHub account-linking provider (Better Auth)
   and require it for connect, then verify the claimed installation appears in
   the user's `GET /user/installations` before linking. This upgrades the
   Consequences entry "GitHub user-OAuth during install … waits on a real need":
   the need is now named, and the trigger is binding. It belongs with the
   deployment-phase real-GitHub-handshake work.

## Related ADRs

- **Extends ADR-0022** (the install flow is the project creator deferred there).
- **Extends ADR-0024** (`installation*` behind the same gate; push stays resolve-existing).
- **Extends ADR-0025** (the installation token its private clone deferred).
- ADR-0023 (the queue the first scan enqueues to; at-least-once, dedupe).
- ADR-0006 (Zod at every boundary — webhook payloads, env, GitHub API responses).
- ADR-0008 (env validated at module load; the App creds join that gate).
