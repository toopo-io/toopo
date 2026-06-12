'use client';

/**
 * D6 (ADR-0029) — the unused-symbol Insight: top-level declarations with no
 * incoming usage. Trust-inverted (the accent is for uncertainty): a certain-unused
 * row is neutral; a *candidate* (an unresolved usage could still reach it) is the
 * accent. We never assert "dead" — the label is "no usage detected" and the
 * exported fact is shown so the reader judges API-vs-dead. The bare-identifier
 * residual is disclosed at the foot of the list.
 */
import type { UnusedSymbolPage } from '@toopo/api-contracts';
import { useTranslations } from 'next-intl';
import type { JSX } from 'react';
import { TRUST_COLOR_VAR, type TrustKind } from '../../../lib/graph/trust';
import { useGraphUnusedSymbols } from '../../../lib/graph/use-graph-queries';
import { TrustMark } from '../graph/trust-mark';

type UnusedRow = UnusedSymbolPage['items'][number];

export function UnusedSymbolsSection({ locale }: { locale: string }): JSX.Element {
  const t = useTranslations('Insights');
  const query = useGraphUnusedSymbols(locale);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="mb-3 flex flex-col gap-1">
        <h2 className="font-semibold text-foreground text-lg tracking-tight">
          {t('unused.title')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('unused.description')}</p>
      </header>
      <Body query={query} t={t} />
    </section>
  );
}

function Body({
  query,
  t,
}: {
  query: ReturnType<typeof useGraphUnusedSymbols>;
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
    return <p className="text-muted-foreground text-sm">{t('unused.empty')}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1">
        {query.data.items.map((row) => (
          <UnusedRowItem key={row.node.id} row={row} t={t} />
        ))}
      </ul>
      <p className="text-faint text-xs">{t('unused.residual')}</p>
      {query.data.nextCursor !== null ? (
        <p className="text-faint text-xs">{t('unused.more')}</p>
      ) : null}
    </div>
  );
}

function UnusedRowItem({
  row,
  t,
}: {
  row: UnusedRow;
  t: ReturnType<typeof useTranslations<'Insights'>>;
}): JSX.Element {
  // Trust inversion: a candidate is uncertain → the accent; certain-unused → neutral.
  const kind: TrustKind = row.candidate ? 'inferred' : 'deterministic';
  const label = row.candidate ? t('unused.candidate') : t('unused.certain');
  return (
    <li
      className="flex items-center gap-2 rounded-md border border-border border-l-2 px-2 py-1 text-sm"
      style={{ borderLeftColor: TRUST_COLOR_VAR[kind] }}
    >
      <TrustMark kind={kind} label={label} />
      <span className="truncate font-mono text-muted-foreground text-xs" title={row.node.id}>
        {row.node.id}
      </span>
      {row.exported ? (
        <span className="ml-auto shrink-0 rounded border border-border px-1 font-mono text-[10px] text-faint">
          {t('unused.exported')}
        </span>
      ) : null}
    </li>
  );
}
