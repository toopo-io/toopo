'use client';

/**
 * The Insights surface (ADR-0029): the deterministic, project-global derived
 * views as a sibling list surface of the cartography canvas. Sections are added
 * by slice — D5 name collisions here; D6 unused symbols and D7 cycles follow. The
 * project scope is provided once so every section's read hook is project-keyed.
 */
import type { JSX } from 'react';
import { ProjectIdProvider } from '../../../lib/projects/project-context';
import { NameCollisionsSection } from './name-collisions-section';
import { UnusedSymbolsSection } from './unused-symbols-section';

interface InsightsViewProps {
  readonly projectId: string;
  readonly locale: string;
}

export function InsightsView({ projectId, locale }: InsightsViewProps): JSX.Element {
  return (
    <ProjectIdProvider projectId={projectId}>
      <div className="flex flex-col gap-4">
        <NameCollisionsSection locale={locale} />
        <UnusedSymbolsSection locale={locale} />
      </div>
    </ProjectIdProvider>
  );
}
