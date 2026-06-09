import type { Mixin } from 'external-lib';
import { forwardRef, memo } from 'react';

export const siteConfig = { name: 'x' };
export const answer = 42;

export type Mode = 'fast' | 'safe';
export interface Props {
  label: string;
}

export const Boxed = forwardRef<HTMLDivElement, Props>((props, ref) => (
  <div ref={ref}>{props.label}</div>
));
export const Both = memo(
  forwardRef<HTMLDivElement, Props>((props, ref) => <div ref={ref}>{props.label}</div>),
);

function someHoc<T>(value: T): T {
  return value;
}
function inner(): null {
  return null;
}
// An unknown HOC must NOT be guessed as a component — it stays a value.
export const Decorated = someHoc(inner);

class LocalBase {
  base(): number {
    return 1;
  }
}
export class Service extends LocalBase implements Mixin {
  go(): number {
    return this.base();
  }
}
// extends-only (no implements), and a generic global supertype with no binding.
export class OnlyExtends extends LocalBase {}
export class Listy extends Array<string> {}

// A destructuring declarator has no single stable identity → no symbol.
export const { name: nestedName } = siteConfig;

export function useThing(): number {
  return answer;
}
