import { useState } from 'react';
import { Button } from './Button';

interface CounterProps {
  label: string;
}

export function Counter({ label }: CounterProps) {
  const [count, setCount] = useState(0);
  return (
    <Button onClick={() => setCount(count + 1)}>
      {label}: {count}
    </Button>
  );
}
