import { helper } from './helper';

interface Options {
  readonly retries: number;
}

type Mode = 'fast' | 'safe';

export function identity<T>(value: T): T {
  return value;
}

// A type assertion `<Options>raw` — the construct the `tsx` grammar misparses
// as JSX. The `typescript` grammar parses it correctly, so this file is
// `analyzed`, not `parse-error`.
export const toOptions = (raw: unknown): Options => <Options>raw;

// Capitalized, but a `.ts` file has no JSX, so this must classify as a plain
// `ts:function` — never a `react:component`.
export function Widget(mode: Mode): number {
  return helper(mode);
}
