# @toopo/api-contracts

Shared Zod schemas that define the contract between `apps/api` and `apps/web`.
Single source of truth for any data that crosses the wire.

## Why this exists

Without a shared contract package, request/response shapes drift over time as
each side defines them independently. With this package:

- `apps/api` validates incoming requests and serializes responses against the
  same schema the OpenAPI document is generated from.
- `apps/web` parses API responses with the same schema, getting full type
  safety and runtime guarantees end-to-end.
- Forms in `apps/web` reuse the same schemas (via `@hookform/resolvers/zod`)
  so client-side validation is byte-for-byte identical to server-side.

## Constraints

- Pure TypeScript, framework-agnostic.
- Zero runtime dependencies except `zod` (peer dependency — apps install it).
- No imports from `@nestjs/*`, `next/*`, `react`, or any other framework.

## Exports

- `./schemas/health` — `HealthCheckResponseSchema`, `HealthCheckRequestSchema`,
  `HealthStatusSchema`.
- `./errors` — `ErrorCode`, `ErrorResponseSchema`.
- `./types` — inferred TypeScript types for all schemas.

## Adding a new contract

1. Add the Zod schema under `src/schemas/<feature>.schema.ts`.
2. Add a `.spec.ts` next to it covering valid + invalid round-trips.
3. Re-export from `src/index.ts` and add an `exports` entry in `package.json`.
4. Both apps now consume it via `@toopo/api-contracts/schemas/<feature>`.
