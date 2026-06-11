import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Public env the client reads at module load (e.g. the Better Auth client builds
// its base URL eagerly). Tests don't hit the network, so any valid URL satisfies
// the boundary validator; set before the app modules import `env.ts`.
process.env['NEXT_PUBLIC_API_URL'] ||= 'http://localhost:4000';
process.env['NEXT_PUBLIC_AUTH_URL'] ||= 'http://localhost:4000';
process.env['NEXT_PUBLIC_DEFAULT_LOCALE'] ||= 'en';

// Unmount React trees between tests so repeated renders don't accumulate in the DOM.
afterEach(() => {
  cleanup();
});

// jsdom has no matchMedia; next-themes (and any media-query-aware UI) calls it on
// mount. Provide an inert, non-matching stub so theme/UI components render in tests.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}
