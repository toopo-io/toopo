import type { ReactNode } from 'react';

export const metadata = {
  title: 'Toopo',
  description: 'Continuous, deterministic cartography of a codebase',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return children;
}
