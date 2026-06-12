/**
 * Trust-safe signature + JSDoc composition for the node inspector (F2). Both are
 * DETERMINISTIC and OMIT-NEVER-FABRICATE:
 *
 *  - The signature is `name(params): returnType`, assembled from the node's own
 *    name, its declared parameters, and its recorded return type. Any part that is
 *    absent is left out — never an invented type, never an empty `()` that would
 *    falsely assert "takes no arguments" when the parameters simply were not
 *    captured.
 *  - The JSDoc is rendered VERBATIM from the recorded comment: the `/** … *\/`
 *    fence and the leading `*` margins are stripped, the free description and the
 *    `@param`/`@returns` tags are kept word for word, with no semantic AST and no
 *    fuzzy tag re-attribution.
 *
 * Pure and testable; no React, no DOM.
 */
export interface SignatureParam {
  readonly name: string;
  readonly type?: string;
}

export function composeSignature(
  name: string,
  params: readonly SignatureParam[],
  returnType?: string,
): string {
  const paramList =
    params.length > 0
      ? `(${params.map((p) => (p.type !== undefined ? `${p.name}: ${p.type}` : p.name)).join(', ')})`
      : '';
  const ret = returnType !== undefined ? `: ${returnType}` : '';
  return `${name}${paramList}${ret}`;
}

export interface JsdocTag {
  readonly tag: string;
  readonly text: string;
}

export interface ParsedJsdoc {
  readonly description: string;
  readonly tags: readonly JsdocTag[];
}

/**
 * Parse a raw JSDoc comment into its description and tags, verbatim. Returns null
 * when nothing meaningful remains after stripping the fence and margins.
 */
export function parseJsdoc(raw: string): ParsedJsdoc | null {
  const cleaned = raw
    .replace(/^\s*\/\*\*?/, '')
    .replace(/\*\/\s*$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').replace(/\s+$/, ''))
    .join('\n')
    .trim();
  if (cleaned.length === 0) {
    return null;
  }

  const description: string[] = [];
  const tags: JsdocTag[] = [];
  let current: { tag: string; text: string } | null = null;
  for (const line of cleaned.split('\n')) {
    const match = line.match(/^@(\w+)\s*(.*)$/);
    if (match !== null) {
      if (current !== null) {
        tags.push(current);
      }
      current = { tag: match[1] ?? '', text: match[2] ?? '' };
    } else if (current !== null) {
      // A wrapped continuation of the current tag — fold it on, collapsing the
      // indentation a multi-line JSDoc uses to align under the tag.
      current.text = `${current.text} ${line.trim()}`.trim();
    } else {
      description.push(line);
    }
  }
  if (current !== null) {
    tags.push(current);
  }
  return { description: description.join('\n').trim(), tags };
}
