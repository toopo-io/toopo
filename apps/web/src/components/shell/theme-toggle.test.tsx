import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '../../i18n/messages/en.json';
import { ThemeProvider } from '../../providers/theme-provider';
import { ThemeToggle } from './theme-toggle';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

function renderToggle(): void {
  render(
    <ThemeProvider>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ThemeToggle />
      </NextIntlClientProvider>
    </ThemeProvider>,
  );
}

describe('<ThemeToggle />', () => {
  it('switches the document theme when a segment is chosen', async () => {
    renderToggle();
    screen.getByRole('button', { name: /Dark/ }).click();
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
    screen.getByRole('button', { name: /Light/ }).click();
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });

  it('marks the active theme segment as pressed', async () => {
    localStorage.setItem('theme', 'dark');
    renderToggle();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Dark/ })).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
