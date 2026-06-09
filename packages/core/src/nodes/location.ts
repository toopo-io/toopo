import { z } from 'zod';

/**
 * VOLATILE source position (ADR-0015 §4, Fork 6). This is metadata, never
 * identity: it changes on every reformat while the logical identity is
 * stable. Coordinates are tree-sitter-native — 0-based `row`/`column` plus
 * byte offsets — so the parser stores its source of truth without conversion;
 * any 1-based display mapping is the UI's concern.
 */
export const PositionSchema = z
  .object({
    row: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
  })
  .strict();
export type Position = z.infer<typeof PositionSchema>;

export const LocationSchema = z
  .object({
    start: PositionSchema,
    end: PositionSchema,
    startByte: z.number().int().nonnegative(),
    endByte: z.number().int().nonnegative(),
  })
  .strict();
export type Location = z.infer<typeof LocationSchema>;
