import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Testing Library's async utilities (`waitFor`, and `findBy*` which builds on it)
// default to a 1000ms ceiling tuned for fast local runs. The first test in a file
// pays a one-time cold-start cost (module init, the first QueryClient + next-intl
// provider, the first jsdom layout); on a contended CI runner that oversubscribes
// the cores with many parallel test files, that legitimately-correct render can
// exceed 1000ms and the wait expires before the resolved query repaints. Granting
// a CI-realistic ceiling makes every async wait robust without weakening a single
// assertion — the awaited condition is unchanged, only the patience for a slow
// (but correct) render. Kept well below the React `testTimeout` so a genuine hang
// still surfaces as a clean async-util error rather than a blunt test timeout.
configure({ asyncUtilTimeout: 5000 });

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
