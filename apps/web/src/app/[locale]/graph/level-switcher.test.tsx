import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../i18n/messages/en.json';
import { LevelSwitcher } from './level-switcher';

function renderSwitcher(props: Parameters<typeof LevelSwitcher>[0]): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LevelSwitcher {...props} />
    </NextIntlClientProvider>,
  );
}

describe('<LevelSwitcher />', () => {
  it('gates Symbols off until a scope is active, then enables it', () => {
    const onSelect = vi.fn();
    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LevelSwitcher level="package" canSymbol={false} onSelect={onSelect} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('button', { name: messages.Graph.level.symbol })).toBeDisabled();
    unmount();

    renderSwitcher({ level: 'file', canSymbol: true, onSelect });
    expect(screen.getByRole('button', { name: messages.Graph.level.symbol })).toBeEnabled();
  });

  it('reports the selected level and marks the current one', () => {
    const onSelect = vi.fn();
    renderSwitcher({ level: 'file', canSymbol: true, onSelect });
    const files = screen.getByRole('button', { name: messages.Graph.level.file });
    expect(files).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: messages.Graph.level.package }));
    expect(onSelect).toHaveBeenCalledWith('package');
  });
});
