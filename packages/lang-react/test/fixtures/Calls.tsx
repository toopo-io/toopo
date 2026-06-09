import D, { compute as calc } from 'lib';
import { useState } from 'react';
import { Button } from './Button';
import type { Props } from './types';

export function helper(x: number) {
  return x * 2;
}

export function Panel({ title }: Props) {
  const [open, setOpen] = useState(false);
  helper(1);
  calc(2);
  D();
  setOpen(open);
  return <Button>{title}</Button>;
}
