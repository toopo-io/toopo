# Toopo

Continuous, deterministic cartography of a codebase. A parser turns a repo into a
rich, queryable graph of symbols, dependencies and usages — updated on every push,
delta-only. The graph is the foundation feature; everything else is built on it.

## Product

- **Visual cartography**: see what a component expects, what calls what with which props, unused symbols, recursive cycles — zoomable from package level down to call-site without re-parsing.
- **Scoped AI analysis (same graph)**: target a node, traverse the graph instead of feeding a whole repo to an LLM. Findings become kanban cards tracked across commits; accepted fixes open a PR (never auto-merged) that must pass the user's own CI.
- **Open-source-first and fully self-hostable.** Billing, hosted-only features, and anything Stripe never live in this repo. The free/paid line is the deterministic (free) / calibrated-hosted-AI (paid) line.

## Cardinal principles

- **Architecture first, zero tech debt.** Cleanest, most extensible path even when harder. No hacks, no "temporary" shortcuts.
- **Trust principle.** Detect deterministically whenever possible; the graph proves impact. AI is a last resort, only on what static analysis cannot resolve. Certain and uncertain must always be distinguishable — in data and UI. Never assert "nothing breaks" as a certainty. One false positive destroys trust: prefer missing a real issue over crying a false one.
- **Determinism.** The same commit produces a byte-identical deterministic graph. The deterministic layer contains no AI.
- **Graceful degradation.** Unsupported language or unparseable file is marked and skipped, never fatal. A mixed-language repo never crashes the analysis.
- **Isolate what varies.** Language (`lang-*`), AI model (`ai-router`), queue, storage, deployment — each behind an interface. The core never changes; only implementations do. This is what lets Toopo scale across languages, models and load without debt.
- **Cost-aware, never at the expense of perfection.** Optimize prompts/models/techniques to cost less — only when quality is untouched.

## Architecture

Three layers, strict boundaries:

- `apps/*` — thin, deployable, no business logic (web = Next UI, api = Nest auth/webhooks/orchestration).
- `packages/*` — thick, all logic.
- `tooling/*` — shared, centralized configs.

Dependency rules (hard, machine-enforced — see Verification gates): one-way
(apps → packages, never reverse), no cycles, one responsibility per package.
`packages/core` is a flat base (universal graph format + types) every package depends
on directly — dependency-light (zero bundled runtime deps; zod peer only, ADR-0015).

Pipeline: Parse (tree-sitter, per file) → Resolve (cross-file heuristics, per
language) → Serve (queryable graph + derived views). See ADR-0016 (Parse/Resolve)
and ADR-0020 (Serve).

| Package | Status | Role |
| --- | --- | --- |
| `apps/web`, `apps/api` | existing | UI; API (thin) — incl. the GitHub push-webhook receiver: verify HMAC, resolve repo→project, enqueue ingest job (ADR-0024) |
| `apps/worker` | existing | minimal ingest→persist CLI to populate the graph DB; precursor to the queue/webhook worker (ADR-0020) |
| `packages/{api-contracts, env, i18n, ui}` | existing | shared plumbing |
| `packages/db` | existing | persistence: Kysely dual-backend (SQLite self-host / Postgres cloud) + Better Auth tables + project tenancy + project-scoped Serve read primitives + the `job` table & `JobStore` claim seam (ADR-0017, ADR-0020, ADR-0022, ADR-0023) |
| `packages/core` | existing | universal graph format + types (ADR-0015) |
| `packages/parser` | existing | tree-sitter orchestration |
| `packages/resolver` | existing | semantic resolution |
| `packages/lang-react` | existing | React/TS rules (first language) |
| `packages/ingest` | existing | Parse→Resolve pipeline driver (filesystem edge → graph document) |
| `packages/serve` | existing | Serve pass: derived read views + composition over the graph (ADR-0020) |
| `packages/queue` | existing | job-queue abstraction: `Queue`/`Consumer` port + reliability driver (idempotency, backoff+jitter retries, never-silent dead-letter) over a swappable `JobStore`; in-memory + DB-backed; Redis deferred (ADR-0023) |
| `packages/{analysis, ai-router}` | planned | AI analysis; model router |

Adding a language = a new `lang-*` package, zero change to core or pipeline.

## Decisions are law

ADRs in `docs/adr/` are binding. Never deviate from an accepted ADR; to change one,
supersede it with a new ADR. Foundational set:

- **ADR-0015** — universal code-graph model.
- **ADR-0016** — parsing & resolution (tree-sitter via `web-tree-sitter`; custom heuristic resolver; NOT stack-graphs, NOT LSP; file-level incremental).
- **ADR-0017** — storage: dual-backend (SQLite self-host / Postgres cloud) via Kysely; supersedes ADR-0012.
- **ADR-0020** — Serve pass: `packages/serve` composition + `@toopo/db` read primitives + thin `apps/api`; REST + Zod; on-read views; keyset pagination; `apps/worker` populate CLI.
- **ADR-0022** — Project tenancy & graph access control: administrative `project` entity (distinct from the graph `repo` node); graph scoped by composite PK `(project_id, …)` + a mandatory `GraphScope`; instance-tenant OSS authorization; `/v1/projects/:projectId/graph/*` behind the session guard. Extends ADR-0017 (does not supersede).
- **ADR-0023** — Job queue: abstract `Queue`/`Consumer` port selected by config; DB-backed dual-backend (SQLite serialized claim / Postgres `FOR UPDATE SKIP LOCKED`) + in-memory; Redis/BullMQ deferred; at-least-once, idempotent consumers, backoff+jitter retries, never-silent dead-letter; reference-only job payload. Extends ADR-0017 (the claim is its one documented portable-SQL exception).
- **ADR-0024** — GitHub push-webhook ingestion: signature verification is a gate before any processing (HMAC-SHA256 over the raw body vs `X-Hub-Signature-256`, constant-time, reject before resolve/enqueue); raw body via Nest `rawBody: true`, `bodyLimit` 25 MB (GitHub's max deliverable payload); `GITHUB_WEBHOOK_SECRET` optional + fail-closed `503` when unset; only default-branch pushes enqueue; resolve-existing-only (miss → `200` ignored, B5 owns create); reference-only job deduped by `${projectId}:${commitSha}`; canonical host `'github.com'`. Extends ADR-0020/0022/0023.

Read `docs/adr/README.md` before architectural work.

## Engineering standards — PERFECTION CHARTER

- No hacks, no shortcuts, no "temporary" fix, no deferred TODO. Cleanest path, always.
- English only — code, identifiers, comments, commits, docs, test names, any text.
- Quality bar: exemplary on sight to the best engineer alive. Optimal correctness, performance, memory, speed.
- Zero duplication: search before writing; reuse if it exists; factor shared logic into a properly-placed reusable unit — never copy-paste.
- Immutability: never mutate inputs or shared state; return new values. Pure functions by default; isolate side effects.
- Error handling: handle errors explicitly at every level; never swallow; clear user-facing messages, detailed server-side context. Validate all input at every boundary (webhook, parsed input, AI I/O, storage reads) with Zod against the core schemas (ADR-0006). Never trust external data.
- Size limits (checked, not aspirational): functions <50 lines, files <800 (200–400 typical), nesting <4 (use early returns). Split before growth.
- Readability first for any reader, human or AI: clear names, obvious structure, no obscuring cleverness.
- Comments only when they add real value (the "why", not the "what"). No comment spam.
- Research before deciding: verify a library/pattern is genuinely best (existing implementations, official docs, registries). Prefer proven over hand-rolled. State what you verified.
- Stop-gate when it matters, not when it doesn't. On a real fork/ambiguity/blocker, STOP and ask inline. NEVER use the AskUserQuestion tool. Don't stop for trivia.

## Security baseline (non-negotiable)

- No hardcoded secrets — env vars / secret manager only; validate required secrets at startup.
- Webhook signature is verified before any processing — unsigned/invalid is rejected (prevents forgery and uncontrolled AI cost).
- A job carries a repo/commit reference, never the code itself.
- Treat all analysed repo content and external data as untrusted input.

## Verification gates — Definition of Done

A change is "done" only when ALL pass — not when the code is written:

1. TypeScript strict typecheck — clean.
2. Biome lint + format — clean.
3. Vitest — green, ≥80% coverage on new code (unit + integration; E2E for critical flows).
4. Build — green across the affected graph.
5. Dependency-boundary check — one-way, no cycles, core dependency-light.
6. Conventional Commit message.

Enforcement: lefthook (pre-commit/pre-push) + CI run these. The dependency-boundary
check is mandated here; its tool is to be selected by research and wired into CI.
A rule without a gate is a gap — surface it.

## Working in this repo

- Start: read this file + the relevant ADRs; ground in existing patterns — never invent a pattern when one exists.
- Build: smallest correct change; mirror conventions; immutable, validated, tested.
- Finish: run every Verification gate. If a decision changed, write/supersede the ADR and update this file in the same change.

## Extending the system

- New language → new `lang-*` package behind the language interface; no core/pipeline change.
- New decision → an ADR (or supersede one); never a silent deviation.
- New package → obey the dependency rules; single responsibility; add to the map above. Every extension inherits this constitution — including this document, kept in sync with the ADRs it points to. Decisions live in ADRs; cross-cutting rules live here; never duplicate, always point.
