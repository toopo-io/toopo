import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeProvider } from './theme-provider';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
  localStorage.clear();
});

describe('<ThemeProvider />', () => {
  it('renders its children', () => {
    render(
      <ThemeProvider>
        <span>mapped</span>
      </ThemeProvider>,
    );
    expect(screen.getByText('mapped')).toBeInTheDocument();
  });

  it('applies the light theme by default via the data-theme attribute', async () => {
    render(
      <ThemeProvider>
        <span>canvas</span>
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });
  });

  it('restores a persisted theme choice over the default', async () => {
    localStorage.setItem('theme', 'dark');
    render(
      <ThemeProvider>
        <span>canvas</span>
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });
});
