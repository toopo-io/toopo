import type { CallSitePayloadArgument } from '@toopo/core';

/**
 * Call-site payload builders (ADR-0015 §7). The trust split lives here once: a
 * statically-known value is `deterministic`; a spread is `inferred` because we
 * never guess what it expands to. `value` is the opaque source expression.
 */
export function positionalArg(ordinal: number, value: string): CallSitePayloadArgument {
  return { ordinal, passKind: 'positional', value, resolution: 'deterministic' };
}

export function namedArg(
  ordinal: number,
  name: string,
  value: string | undefined,
): CallSitePayloadArgument {
  return {
    ordinal,
    passKind: 'named',
    name,
    resolution: 'deterministic',
    // omitted (not undefined) for a boolean-shorthand JSX prop, e.g. `<C disabled/>`.
    ...(value === undefined ? {} : { value }),
  };
}

export function spreadArg(ordinal: number, value: string): CallSitePayloadArgument {
  return { ordinal, passKind: 'spread', value, resolution: 'inferred', confidence: 'low' };
}
