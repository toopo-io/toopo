# Development setup

> This is a thin outline. A full root `CONTRIBUTING.md` is on the way; this page captures the essentials to get a development environment running.

## Prerequisites

- Node.js 22 (`.nvmrc` pins the version).
- pnpm 11 (`npm install -g pnpm@11.1.1`).
- Git.

## Set up

```bash
git clone https://github.com/toopo-io/toopo.git
cd toopo
pnpm install
pnpm build
pnpm dev
```

`pnpm build` compiles the shared packages (Turborepo caches it); `pnpm dev` runs the dev servers. Apps consume the compiled `dist/` of each package, so a build must precede a run — Turbo's task graph handles this automatically.

## Environment

Local development uses per-app env files (`apps/api/.env`, `apps/web/.env.local`); see each app's README for the dev variables. The container/self-host surface is documented in [environment variables](../reference/environment-variables.md).

## Before you commit

Every change must pass the [verification gates](verification-gates.md) and use a [Conventional Commit](https://www.conventionalcommits.org/) message.

---

**See also:** [Verification gates](verification-gates.md) · [Adding a language](adding-a-language.md) · [Architecture overview](../architecture/overview.md).
