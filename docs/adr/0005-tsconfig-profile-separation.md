# ADR 0005: TSConfig profile separation

Date: 2026-05-15
Status: Accepted

## Context

We have at least four distinct TypeScript runtime targets in the tree:
NestJS on CJS, Next.js with bundler resolution, modern Node ESM
services (Vitest, future workers), and shared libraries that emit
declarations. A single shared tsconfig would have to compromise on
every axis (module system, declaration emission, decorators,
verbatimModuleSyntax). Mistakes here surface as cryptic
"works-locally-but-not-in-prod" failures.

## Decision

`tooling/tsconfig/` exposes five named profiles. Apps and packages
extend the one that matches their runtime model:

| Profile | Use for | Module | Resolution |
| --- | --- | --- | --- |
| `base.json` | Foundation only, not extended directly | ESM | Bundler |
| `node.json` | Modern Node services using native ESM (`"type": "module"`) | NodeNext | NodeNext |
| `node-classic.json` | NestJS or other CJS Node services. Decorators on, `verbatimModuleSyntax` off | CommonJS | Node10 |
| `nextjs.json` | Next.js apps | ESNext | Bundler |
| `library.json` | Shared packages emitting `.d.ts` (`composite: true`) | ESM | Bundler |

`apps/api` extends `node-classic.json`. `apps/web` extends
`nextjs.json`. All `packages/*` extend `library.json`.

## Consequences

- Each consumer extends one file; the diff between profiles documents
  exactly *what* differs at the module-system level.
- Adding a new runtime target (e.g. Cloudflare Worker) is "create a
  new profile, extend `base.json`" — no risk of regressing the
  existing ones.
- More files to skim than a single shared config. We accept this for
  clarity over brevity.

## Alternatives considered

- **One shared tsconfig with overrides per package**: every package
  ends up redeclaring `module`, `moduleResolution`, `lib`,
  `verbatimModuleSyntax`. The "shared" part becomes vestigial.
- **No shared tsconfig**: complete drift over time.
