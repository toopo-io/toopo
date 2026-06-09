'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { type JSX, type ReactNode, useState } from 'react';
import { makeQueryClient } from '../lib/query-client';

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps): JSX.Element {
  const [client] = useState(() => makeQueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
