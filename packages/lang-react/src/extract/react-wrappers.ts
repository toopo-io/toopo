import type { Node as SyntaxNode } from 'web-tree-sitter';

/**
 * The KNOWN React component wrappers (Fix B). A `const C = forwardRef(...)`,
 * `memo(...)`, or `memo(forwardRef(...))` declares a component; the props are
 * the wrapped render function's first parameter. Recognition is deliberately
 * limited to this exact set (bare or `React.`-qualified) — an arbitrary HOC
 * (`const C = withFoo(Bar)`) is NOT a component, it is a `ts:variable` (the
 * trust principle: a guessed component role is worse than a general one).
 */
const WRAPPERS = new Set(['forwardRef', 'memo']);

/** Whether a variable's value is a known React component wrapper call. */
export function isReactComponentWrapper(value: SyntaxNode | null): boolean {
  return wrapperCallee(value) !== null;
}

/**
 * The render function's parameter list inside a wrapper call (its props), or
 * null if the wrapper does not wrap an inline arrow/function. Recurses through
 * `memo(forwardRef(fn))` to the innermost render function.
 */
export function wrapperRenderParams(value: SyntaxNode | null): SyntaxNode | null {
  let current = value;
  while (current !== null && wrapperCallee(current) !== null) {
    const arg = firstArgument(current);
    if (arg === null) {
      return null;
    }
    if (arg.type === 'arrow_function' || arg.type === 'function_expression') {
      return arg.childForFieldName('parameters');
    }
    current = arg; // e.g. memo(forwardRef(fn)) → descend into forwardRef(fn)
  }
  return null;
}

/** The wrapper name (`forwardRef`/`memo`) if `value` is such a call, else null. */
function wrapperCallee(value: SyntaxNode | null): string | null {
  if (value === null || value.type !== 'call_expression') {
    return null;
  }
  const callee = value.childForFieldName('function');
  if (callee === null) {
    return null;
  }
  const name = calleeName(callee);
  return name !== null && WRAPPERS.has(name) ? name : null;
}

/** The simple or `React.`-qualified name of a callee, or null. */
function calleeName(callee: SyntaxNode): string | null {
  if (callee.type === 'identifier') {
    return callee.text;
  }
  if (callee.type === 'member_expression') {
    return callee.childForFieldName('property')?.text ?? null;
  }
  return null;
}

/** The first argument node of a call expression, or null. */
function firstArgument(call: SyntaxNode): SyntaxNode | null {
  return call.childForFieldName('arguments')?.namedChild(0) ?? null;
}
