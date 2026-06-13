import { z } from 'zod';

/**
 * A Workspace as the shell consumes it (ADR-0028: a Workspace IS a Better Auth
 * organization). Read-only here — Toopo never writes the org; it lists the ones
 * the caller belongs to (the membership read seam). Validated at the boundary
 * (ADR-0006): only the fields the shell renders are modelled; unknown keys from
 * the org plugin are dropped.
 */
const WorkspaceSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  logo: z.string().nullish(),
});

export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>;

export const WorkspaceListSchema = z.array(WorkspaceSummarySchema);

/**
 * The single-letter glyph the topbar/picker shows for a workspace — its first
 * alphanumeric character, uppercased. Falls back to a neutral mark for a name
 * that has none, so the glyph never renders empty.
 */
export function workspaceGlyph(name: string): string {
  const initial = name.trim().match(/[\p{L}\p{N}]/u);
  return initial === null ? '#' : initial[0].toUpperCase();
}
