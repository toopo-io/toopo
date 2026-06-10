'use client';

/**
 * The selected project's id, provided once at the explorer root (from the
 * `/projects/:projectId/graph` route) and read by every graph query hook
 * (ADR-0022 §5). This keeps the project out of the per-view URL search params
 * (it lives in the path) and off every component-to-hook signature, while making
 * a graph fetch impossible without a project — the UI half of the scoping
 * invariant, mirroring the mandatory GraphScope on the server.
 */
import { createContext, type ReactNode, useContext } from 'react';

const ProjectIdContext = createContext<string | null>(null);

export function ProjectIdProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}): ReactNode {
  return <ProjectIdContext.Provider value={projectId}>{children}</ProjectIdContext.Provider>;
}

/** The current project id; throws if used outside a {@link ProjectIdProvider}. */
export function useProjectId(): string {
  const projectId = useContext(ProjectIdContext);
  if (projectId === null) {
    throw new Error('useProjectId must be used within a ProjectIdProvider');
  }
  return projectId;
}
