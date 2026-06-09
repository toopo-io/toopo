import { useState } from 'react';

export function useCounter(start: number) {
  const [count, setCount] = useState(start);
  return { count, setCount };
}

export function Badge({ label, count }: BadgeProps) {
  return (
    <span>
      {label}: {count}
    </span>
  );
}

export function format(value: number) {
  return value.toFixed(2);
}
