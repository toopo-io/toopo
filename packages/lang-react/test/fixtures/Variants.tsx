export const Pill = () => <i />;

export function useToggle({ initial }: ToggleOptions) {
  return initial;
}

export function withOptional(a?: number) {
  return a;
}

export function withRest(...args: number[]) {
  return args.length;
}

export function withArray([first]: number[]) {
  return first;
}

export function Card({ title, ...rest }: CardProps) {
  return <div {...rest}>{title}</div>;
}
