'use client';

/**
 * D7 (ADR-0029) — the recursive-cycle Insight: strongly-connected components of
 * the dependency graph. Trust-inverted (the accent is for uncertainty): a certain
 * cycle (every internal edge proven) is neutral; a *candidate* (rests on an
 * inferred edge) is the accent. We never assert a cycle that rests on a guess.
 */
import type { CyclePage } from '@toopo/api-contracts';
import { useTranslations } from 'next-intl';
import type { JSX } from 'react';
import { TRUST_COLOR_VAR, type TrustKind } from '../../../lib/graph/trust';
import { useGraphCycles } from '../../../lib/graph/use-graph-queries';
import { TrustMark } from '../graph/trust-mark';

type CycleRow = CyclePage['items'][number];

export function CyclesSection({ locale }: { locale: string }): JSX.Element {
  const t = useTranslations('Insights');
  const query = useGraphCycles(locale);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="mb-3 flex flex-col gap-1">
        <h2 className="font-semibold text-foreground text-lg tracking-tight">
          {t('cycles.title')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('cycles.description')}</p>
      </header>
      <Body query={query} t={t} />
    </section>
  );
}

function Body({
  query,
  t,
}: {
  query: ReturnType<typeof useGraphCycles>;
  t: ReturnType<typeof useTranslations<'Insights'>>;
}): JSX.Element {
  if (query.isPending) {
    return <p className="text-muted-foreground text-sm">{t('loading')}</p>;
  }
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : t('unknownError');
    return <p className="text-inferred text-sm">{t('error', { message })}</p>;
  }
  if (query.data.items.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('cycles.empty')}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {query.data.items.map((cycle) => (
          <CycleItem key={cycle.id} cycle={cycle} t={t} />
        ))}
      </ul>
      {query.data.nextCursor !== null ? (
        <p className="text-faint text-xs">{t('cycles.more')}</p>
      ) : null}
    </div>
  );
}

function CycleItem({
  cycle,
  t,
}: {
  cycle: CycleRow;
  t: ReturnType<typeof useTranslations<'Insights'>>;
}): JSX.Element {
  // Trust inversion: a candidate (rests on an inferred edge) is the accent.
  const kind: TrustKind = cycle.candidate ? 'inferred' : 'deterministic';
  const label = cycle.candidate ? t('cycles.candidate') : t('cycles.certain');
  return (
    <li
      className="flex flex-col gap-1.5 rounded-md border border-border border-l-2 px-2 py-1.5"
      style={{ borderLeftColor: TRUST_COLOR_VAR[kind] }}
    >
      <div className="flex items-center gap-2">
        <TrustMark kind={kind} label={label} />
        <span className="text-faint text-xs">{t('cycles.members', { count: cycle.length })}</span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {cycle.members.map((member) => (
          <li
            key={member}
            className="truncate font-mono text-muted-foreground text-xs"
            title={member}
          >
            {member}
          </li>
        ))}
      </ul>
      {cycle.truncated ? <p className="text-faint text-xs">{t('cycles.truncated')}</p> : null}
    </li>
  );
}
