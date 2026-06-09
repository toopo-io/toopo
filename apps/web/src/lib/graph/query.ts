/**
 * Build a query string for the Serve read API. Node ids are SCIP descriptor
 * paths containing `/`, spaces and backticks (ADR-0015 §4), so every value is
 * URL-encoded — `URLSearchParams` percent-encodes correctly. `undefined` values
 * are dropped so optional params never appear as empty keys. Returns `''` (not
 * `'?'`) when there is nothing to send.
 */
export type QueryValue = string | number | undefined;

export function buildQueryString(params: Readonly<Record<string, QueryValue>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const serialized = search.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}
