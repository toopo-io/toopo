import { Icon } from 'lib';
import { Button } from './Button';

export function Badge({ a, b }: BadgeProps) {
  return (
    <span>
      {a}
      {b}
    </span>
  );
}

export function Panel({ items, rest, show }: PanelProps) {
  return (
    <div>
      <Badge a={1} b="x" />
      <Badge {...rest} />
      <Button />
      <Icon />
      {show && <Badge a={2} b="y" />}
      {items.map(() => (
        <Badge a={3} b="z" />
      ))}
    </div>
  );
}
