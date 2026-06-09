import { Button } from './Button';
import type { Theme } from './theme';

export function TypeApp() {
  const theme: Theme = { color: 'blue' };
  return <Button label={theme.color} />;
}
