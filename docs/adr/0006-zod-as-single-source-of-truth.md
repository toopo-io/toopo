# ADR 0006: Zod as single source of truth

Date: 2026-05-15
Status: Accepted

## Context

The web and API need to agree on request and response shapes — every
form field, every query parameter, every JSON body. The traditional
options are hand-typed DTOs duplicated on both sides, OpenAPI-first
codegen, or a shared schema definition. Hand-typed drifts. OpenAPI-
first puts the schema in a YAML file no developer enjoys editing.

## Decision

The shared `packages/api-contracts` package owns every wire schema as
a **Zod 4** object. Both consumers compose against it:

- `apps/api` uses `nestjs-zod` — `createZodDto(Schema)` to wrap any
  schema into a NestJS DTO, `ZodValidationPipe` for request bodies,
  `ZodSerializerInterceptor` for response shape enforcement,
  `cleanupOpenApiDoc` to produce OpenAPI from the same schema for
  `/docs`.
- `apps/web` uses the same Zod schema with
  `@hookform/resolvers/zod` for form validation, and parses fetch
  responses via `Schema.parse(...)` for runtime safety.

`apps/web/env.ts` and `apps/api/src/core/config/env.schema.ts` follow
the same pattern via `@toopo/env` for environment variables.

## Consequences

- One change to a schema flows through validation, serialization,
  forms, and OpenAPI docs on the next build. There is no "client
  forgot to update".
- The OpenAPI document at `/docs` is by construction in sync with the
  runtime contract — useful for partners and for E2E tests that
  assert against the published schema.
- Runtime validation has a non-zero cost. We accept it as the price
  of correctness — every request and every response is parsed.

## Alternatives considered

- **TypeScript types only**: zero runtime cost but no actual
  enforcement at the wire — types lie.
- **JSON Schema + Ajv**: more verbose authoring, weaker DX.
- **OpenAPI-first with codegen**: more pieces to keep in sync,
  generated TS types tend to be uglier than human-authored Zod.
