'use client';

/**
 * The V2 node-detail side-panel (ADR-0020 §5). For the selected symbol it shows
 * its declared interface (expected props/params), its callers and callees, and
 * the call-sites it encloses with the arguments passed — and marks the TRUST of
 * every relationship row (ADR-0015 §8). This is where individual inferred edges
 * (more common than the aggregate case) must read as unmistakably distinct, so
 * each neighbour/argument row carries a solid/dashed `TrustMark` and a trust-tinted
 * left border. The shape is the pure `nodeDetailToViewModel`; this only renders it.
 */
import type { BlastRadiusPage } from '@toopo/api-contracts';
import { useTranslations } from 'next-intl';
import type { JSX, ReactNode } from 'react';
import { blastRows } from '../../../lib/graph/blast';
import {
  type CallSiteRow,
  type InterfaceRow,
  type NeighborRow,
  nodeDetailToViewModel,
} from '../../../lib/graph/node-detail-adapter';
import { TRUST_COLOR_VAR } from '../../../lib/graph/trust';
import { useGraphNode } from '../../../lib/graph/use-graph-queries';
import { TrustMark } from './trust-mark';

interface NodeDetailPanelProps {
  readonly nodeId: string;
  readonly locale: string;
  readonly onClose: () => void;
  readonly blastActive: boolean;
  readonly onToggleBlast: () => void;
  readonly blastPage?: BlastRadiusPage;
  readonly blastLoading: boolean;
}

export function NodeDetailPanel({
  nodeId,
  locale,
  onClose,
  blastActive,
  onToggleBlast,
  blastPage,
  blastLoading,
}: NodeDetailPanelProps): JSX.Element {
  const t = useTranslations('Graph.panel');
  const tb = useTranslations('Graph.blast');
  const tl = useTranslations('Graph.legend');
  const { data, isLoading, error } = useGraphNode(nodeId, locale);
  const vm = data !== undefined ? nodeDetailToViewModel(data) : null;
  const trustLabel = (kind: 'deterministic' | 'inferred'): string =>
    kind === 'inferred' ? tl('inferred') : tl('deterministic');

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-96 max-w-[92vw] flex-col border-border border-l bg-card shadow-xl">
      <header className="flex items-start justify-between gap-3 border-border border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-base" title={vm?.label ?? nodeId}>
            {vm?.label ?? nodeId}
          </h2>
          {vm !== null ? (
            <p className="truncate font-mono text-[11px] text-muted-foreground" title={vm.id}>
              {vm.subKind ?? vm.kind}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleBlast}
            aria-pressed={blastActive}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              blastActive
                ? 'border-(--toopo-impact) text-(--toopo-impact)'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {tb('toggle')}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-md px-2 py-1 text-muted-foreground text-sm hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {blastActive ? <BlastSection page={blastPage} loading={blastLoading} /> : null}
        {error ? (
          <p className="text-destructive text-sm">
            {t('error', { message: error instanceof Error ? error.message : '' })}
          </p>
        ) : isLoading || vm === null ? (
          <p className="text-muted-foreground text-sm">{t('loading')}</p>
        ) : (
          <div className="flex flex-col gap-5">
            <Section
              title={t('interface')}
              count={vm.declaredInterface.length}
              emptyLabel={t('none')}
            >
              {vm.declaredInterface.map((row) => (
                <InterfaceItem key={row.id} row={row} />
              ))}
            </Section>
            <Section title={t('callers')} count={vm.callers.length} emptyLabel={t('none')}>
              {vm.callers.map((row) => (
                <NeighborItem
                  key={`${row.nodeId}:${row.edgeKind}:${row.trustKind}`}
                  row={row}
                  trustLabel={trustLabel}
                  external={t('external')}
                />
              ))}
            </Section>
            <Section title={t('callees')} count={vm.callees.length} emptyLabel={t('none')}>
              {vm.callees.map((row) => (
                <NeighborItem
                  key={`${row.nodeId}:${row.edgeKind}:${row.trustKind}`}
                  row={row}
                  trustLabel={trustLabel}
                  external={t('external')}
                />
              ))}
            </Section>
            <Section title={t('callSites')} count={vm.callSites.length} emptyLabel={t('none')}>
              {vm.callSites.map((row) => (
                <CallSiteItem key={row.id} row={row} trustLabel={trustLabel} />
              ))}
            </Section>
          </div>
        )}
      </div>
    </aside>
  );
}

function Section({
  title,
  count,
  emptyLabel,
  children,
}: {
  title: string;
  count: number;
  emptyLabel: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title}
        <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px]">{count}</span>
      </h3>
      {count === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-1">{children}</ul>
      )}
    </section>
  );
}

function InterfaceItem({ row }: { row: InterfaceRow }): JSX.Element {
  return (
    <li className="flex items-baseline justify-between gap-2 rounded-md border border-border px-2 py-1 text-sm">
      <span className="truncate font-medium" title={row.label}>
        {row.label}
      </span>
      {row.subKind !== undefined ? (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{row.subKind}</span>
      ) : null}
    </li>
  );
}

function NeighborItem({
  row,
  trustLabel,
  external,
}: {
  row: NeighborRow;
  trustLabel: (kind: 'deterministic' | 'inferred') => string;
  external: string;
}): JSX.Element {
  return (
    <li
      className="flex items-center gap-2 rounded-md border border-border border-l-2 px-2 py-1 text-sm"
      style={{ borderLeftColor: TRUST_COLOR_VAR[row.trustKind] }}
    >
      <TrustMark
        kind={row.trustKind}
        {...(row.confidence !== undefined ? { confidence: row.confidence } : {})}
        label={trustLabel(row.trustKind)}
      />
      <span className="min-w-0 flex-1 truncate" title={row.label ?? row.nodeId}>
        {row.label ?? <span className="text-muted-foreground italic">{external}</span>}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{row.edgeKind}</span>
    </li>
  );
}

function BlastSection({
  page,
  loading,
}: {
  page: BlastRadiusPage | undefined;
  loading: boolean;
}): JSX.Element {
  const tb = useTranslations('Graph.blast');
  const rows = page !== undefined ? blastRows(page) : [];
  return (
    <section className="mb-5 rounded-lg border border-(--toopo-impact)/50 bg-(--toopo-impact)/5 p-3">
      <h3 className="mb-1 font-medium text-(--toopo-impact) text-sm">{tb('title')}</h3>
      {/* Honest framing (ADR-0015 §8, Fork 6A): no per-node certainty claim. */}
      <p className="mb-2 text-[11px] text-muted-foreground italic">{tb('caveat')}</p>
      {loading ? (
        <p className="text-muted-foreground text-sm">{tb('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{tb('empty')}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {rows.map((row) => (
              <li
                key={row.nodeId}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-sm"
              >
                <span className="min-w-0 truncate" title={row.label ?? row.nodeId}>
                  {row.label ?? <span className="text-muted-foreground italic">{row.nodeId}</span>}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {tb('depth', { depth: row.depth })}
                </span>
              </li>
            ))}
          </ul>
          {page?.truncated ? (
            <p className="mt-2 text-[11px] text-muted-foreground">{tb('truncated')}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

function CallSiteItem({
  row,
  trustLabel,
}: {
  row: CallSiteRow;
  trustLabel: (kind: 'deterministic' | 'inferred') => string;
}): JSX.Element {
  return (
    <li className="rounded-md border border-border px-2 py-1.5 text-sm">
      <div className="mb-1 font-mono text-xs">{row.callee}(…)</div>
      {row.args.length > 0 ? (
        <ul className="flex flex-col gap-1 pl-2">
          {row.args.map((arg) => (
            <li
              key={arg.ordinal}
              className="flex items-center gap-2 border-l-2 pl-2 text-xs"
              style={{ borderLeftColor: TRUST_COLOR_VAR[arg.trustKind] }}
            >
              <TrustMark
                kind={arg.trustKind}
                {...(arg.confidence !== undefined ? { confidence: arg.confidence } : {})}
                label={trustLabel(arg.trustKind)}
              />
              <span
                className="truncate font-mono text-muted-foreground"
                title={arg.value ?? arg.name}
              >
                {arg.name ?? `#${arg.ordinal}`}
                {arg.value !== undefined ? `=${arg.value}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
