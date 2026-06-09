import { z } from 'zod';
import { SUBKIND_PATTERN } from './constants.js';

/**
 * The open, language-namespaced `subKind` of any node or edge (ADR-0015 §5).
 * It is always optional in core: structural nodes (`repo`/`package`/`file`)
 * have no language, while `lang-*` packages populate it for the symbols,
 * call-sites, and edges they produce — e.g. `react:component`, `ts:typeRef`
 * (Fork 4). Universal queries ignore it; language-aware queries key on it.
 */
export const SubKindSchema = z.string().regex(SUBKIND_PATTERN);
export type SubKind = z.infer<typeof SubKindSchema>;
