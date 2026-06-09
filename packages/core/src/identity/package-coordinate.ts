import { z } from 'zod';

/**
 * Identity coordinate for a symbol that lives OUTSIDE the analyzed repo
 * (e.g. an imported `node_modules` package). Per ADR-0015 Fork 1, the
 * coordinate is `manager` + `name` ONLY — the package VERSION is deliberately
 * excluded from identity, because including it would churn every external-ref
 * identity on a dependency bump and break cross-commit identity stability.
 * Version, when needed, belongs in a node's non-identity `properties`.
 *
 * Backticks are disallowed so the encoded identity string stays losslessly
 * parseable (the descriptor codec uses backticks as its escape delimiter).
 * Real package managers never use backticks in coordinates.
 */
const NO_BACKTICK = /^[^`]+$/;

export const PackageCoordinateSchema = z
  .object({
    manager: z.string().min(1).regex(NO_BACKTICK),
    name: z.string().min(1).regex(NO_BACKTICK),
  })
  .strict();
export type PackageCoordinate = z.infer<typeof PackageCoordinateSchema>;
