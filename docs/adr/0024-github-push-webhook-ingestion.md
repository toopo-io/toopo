# ADR 0024: GitHub push-webhook ingestion — verify-before-processing gate, resolve-existing-only, default-branch scope, reference-only enqueue

Date: 2026-06-10
Status: Accepted

Extends ADR-0020 (thin `apps/api` — receives, verifies, enqueues, responds),
ADR-0022 (project tenancy — the resolve target and the canonical repo
coordinates), and ADR-0023 (the `Queue` port the webhook produces onto).
Supersedes nothing.

## Context

The graph must update "on every push, delta-only". The mechanism is a GitHub
push webhook: GitHub POSTs a signed payload, the API turns it into a
reference-only ingest job, a worker (B4) consumes it. The API is the public,
unauthenticated edge of that pipeline, so its first duty is to reject forgery —
an unsigned or tampered request must do **zero** work, or an attacker controls
our compute and (later) AI cost.

The API parses JSON globally (NestJS on Fastify), but HMAC must be computed over
the **exact raw bytes** GitHub signed — a re-serialized body would not match.
Project creation belongs to the install/connect flow (B5: a GitHub App install
supplies the owner user and installation id); a webhook has neither, so it must
not create tenancy. GitHub redelivers (auto-retry and manual "Redeliver", the
latter with a *new* delivery id), so enqueue must be idempotent on the unit of
work, not on the delivery.

## Decision

1. **Signature verification is a gate that precedes all processing.** A
   `GithubSignatureGuard` runs before the controller handler. It computes
   `HMAC-SHA256` over the raw request body under `GITHUB_WEBHOOK_SECRET` and
   compares it to `X-Hub-Signature-256` (format `sha256=<hex>`) in **constant
   time** (`crypto.timingSafeEqual`, length-checked first so it never throws).
   Missing / malformed / wrong-secret / tampered-body / wrong-algorithm-prefix →
   rejected (`401`/`403`) before any parse-for-meaning, project resolve, or
   enqueue. The secret is read from validated `Env`; the body and signature are
   never logged.

2. **Raw body via Nest-native `rawBody: true`** (`RawBodyRequest.rawBody`),
   keeping the controller inside Nest's guard/filter/DI chain and leaving global
   JSON parsing on every other route untouched. The webhook `bodyLimit` is set
   to **25 MB** — GitHub's documented maximum deliverable payload ("Payloads are
   capped at 25 MB. If an event generates a larger payload, GitHub will not
   deliver a payload for that webhook event."). A smaller cap would `413` a
   legitimate large push — a silently-missed push, the worse failure. Buffering
   up to 25 MB before verification is inherent to HMAC webhook auth (the bytes
   must exist to be signed); request-rate limiting at the edge is the mitigation
   and is out of B3 scope.

3. **The webhook secret is optional, and the route fails closed.** OSS self-host
   may run only the worker CLI with no GitHub App, so a missing
   `GITHUB_WEBHOOK_SECRET` must **not** block boot (graceful degradation). When
   unset, every webhook request is rejected `503` (never accepts unsigned) and a
   single startup warning is logged. When set it is `min(16)`. This honours
   ADR-0008 (the secret's absence is surfaced, never silently accepted) without
   forcing GitHub config on every install.

4. **Only a push to the default branch enqueues.** After the gate, the payload
   is Zod-validated (untrusted input, ADR-0006) against a minimal schema. Enqueue
   iff `X-GitHub-Event` is `push`, `ref === 'refs/heads/' + repository.default_branch`,
   and it is not a branch deletion (`deleted !== true`, `after` is not the
   all-zero sha). Every other case — `ping`, non-push events, non-default branch,
   tag, delete — is acknowledged `200` with no enqueue. The head commit is
   `after`.

5. **Resolve-existing-only.** The repo coordinates resolve a project via
   `findProjectByRepo`. A miss → `200` "ignored" + one structured log, **no
   create, no enqueue**. Creating tenancy here would fabricate an owner and skip
   the install flow (B5 owns create); it also bounds cost for pushes to
   unconnected repos.

6. **Reference-only enqueue, deduped by work unit.** The job is
   `{ projectId, repo: { host, owner, name }, commitSha }` — a reference, never
   the code (ADR-0023 §5; the `.strict()` schema enforces it). The `dedupeKey` is
   `${projectId}:${commitSha}`, so GitHub's auto-retries, manual redeliveries
   (new delivery id, same commit), and multiple branches landing the same sha
   coalesce to one logical job — the delivery id would not.

7. **Canonical host `'github.com'`.** B3 resolves with the literal host
   `'github.com'` and stamps it on the job reference. B5 (connect) MUST store the
   same string, since `findProjectByRepo` is exact-match. This is the binding
   normalization for the GitHub host across slices.

## Consequences

- A forged or replayed request costs one HMAC and nothing else — no resolve, no
  enqueue, no work. Proven adversarially (mocked queue + repo assert zero calls
  on every reject path; the tampered-body case proves the HMAC is over raw bytes).
- Self-host without a GitHub App still boots; the webhook simply fails closed.
- The API stays thin (ADR-0020): receive, verify, resolve, enqueue, respond. All
  analysis is the worker's (B4).
- B5 inherits a fixed contract: canonical host `'github.com'` and the
  resolve-existing-only boundary (B5 is the only creator of projects).
- Accepted limit: a 25 MB buffer per request pre-verification; mitigated by
  edge rate-limiting (out of scope), not by a cap that would drop real pushes.

## Alternatives considered

- **Verify inside the controller / after parsing.** Rejected: the gate must
  precede every side effect; a guard is the structural guarantee that no handler
  code runs for a bad signature.
- **A manual raw Fastify route (auth-bridge style).** Rejected: the auth bridge
  went raw-Fastify only because Better Auth ships a Web-Fetch handler; here it
  would forfeit Nest's filter/DI chain for no gain. `rawBody: true` is native.
- **`bodyLimit` of ~5 MB.** Rejected against the spec: GitHub delivers up to
  25 MB, so 5 MB would silently drop legitimate pushes.
- **Required `GITHUB_WEBHOOK_SECRET` (boot-blocking).** Rejected: breaks
  graceful degradation for self-hosters who run no GitHub App.
- **Resolve-or-create (like the worker CLI).** Rejected: fabricates tenancy
  without an owner/installation and usurps the B5 install flow.
- **Dedupe by `X-GitHub-Delivery`.** Rejected: a manual redelivery gets a new
  delivery id, so the same commit would enqueue twice; the work unit is the
  `(project, commit)` pair.

## Related ADRs

- **Extends ADR-0020** (thin API — this is the push-ingestion edge it described).
- **Extends ADR-0022** (the resolve target, the `projectId` scope, and the
  canonical repo coordinates the job carries).
- **Extends ADR-0023** (the `Queue` port the webhook enqueues onto; the
  reference-only payload and `dedupeKey` are its contract).
- ADR-0006 (Zod at boundaries — the push payload is validated after the gate).
- ADR-0008 (env validation / explicit migrations — the secret is startup-checked
  when present; the `job` table is migrated via `db:migrate`, never on boot).
