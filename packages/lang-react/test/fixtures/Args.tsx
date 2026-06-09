export function take(first: number, { a, b }: Opts) {
  return first + a + b;
}

export function caller(stuff: number[]) {
  take(1, { a: 2, b: 3 });
  take(...stuff);
  return null;
}
