'use client';

/**
 * The V2 node-detail side-panel (ADR-0020 §5) — a spec-list for the selected
 * symbol. It opens with the composed signature and verbatim JSDoc (F2, omit-never-
 * fabricate), flags when any relationship is inferred, then lists the declared
 * parameters, the lazily-loaded local variables and nested functions (ADR-0027),
 * the callers and callees, and each enclosed call-site stitched to the parameters
 * its arguments bind (D1). Every relationship row carries its TRUST (ADR-0015 §8)
 * as a solid/dashed mark and a trust-tinted left border; an uncertain binding —
 * inferred or unbound — reads in the accent. The shapes are the pure adapters;
 * this only renders them, never claiming an unused/cycle/unresolved fact (the
 * ADR-0016 C11 Phase-D boundary).
 */
import type { BlastRadiusPage } from '@toopo/api-contracts';
import { useTranslations } from 'next-intl';
import { type JSX, type ReactNode, useState } from 'react';
import { blastRows } from '../../../lib/graph/blast';
import {
  type BindingRow,
  type CallSiteRow,
  callBindingRows,
  declarationBuckets,
  type InterfaceRow,
  type NeighborRow,
  nodeDetailToViewModel,
} from '../../../lib/graph/node-detail-adapter';
import type { ParsedJsdoc } from '../../../lib/graph/node-signature';
import { TRUST_COLOR_VAR } from '../../../lib/graph/trust';
import {
  useGraphCallBindings,
  useGraphDeclarations,
  useGraphNode,
} from '../../../lib/graph/use-graph-queries';
import { TrustMark } from './trust-mark';

type TrustLabel = (kind: 'deterministic' | 'inferred') => string;

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
  const trustLabel: TrustLabel = (kind) =>
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
            <SignatureBlock label={vm.label} signature={vm.signature} jsdoc={vm.jsdoc} />
            {vm.hasInferredEdge ? <InferredCallout text={t('inferredCallout')} /> : null}

            <Section title={t('parameters')} count={vm.parameters.length} emptyLabel={t('none')}>
              {vm.parameters.map((row) => (
                <InterfaceItem key={row.id} row={row} />
              ))}
            </Section>

            {vm.kind === 'symbol' ? <MembersDisclosure nodeId={vm.id} locale={locale} /> : null}

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
                <CallSiteItem key={row.id} row={row} locale={locale} trustLabel={trustLabel} />
              ))}
            </Section>
          </div>
        )}
      </div>
    </aside>
  );
}

function SignatureBlock({
  label,
  signature,
  jsdoc,
}: {
  label: string;
  signature: string;
  jsdoc: ParsedJsdoc | null;
}): JSX.Element | null {
  const t = useTranslations('Graph.panel');
  // Skip the signature line when it is merely the bare name (the header already
  // shows it); still render the doc block when there is documentation.
  const showSignature = signature !== label;
  if (!showSignature && jsdoc === null) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2">
      {showSignature ? (
        <code className="block overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
          {signature}
        </code>
      ) : null}
      {jsdoc !== null ? (
        <div className="text-sm">
          <h3 className="sr-only">{t('documentation')}</h3>
          {jsdoc.description.length > 0 ? (
            <p className="whitespace-pre-wrap text-muted-foreground">{jsdoc.description}</p>
          ) : null}
          {jsdoc.tags.length > 0 ? (
            <dl className="mt-1.5 flex flex-col gap-0.5">
              {jsdoc.tags.map((tag) => (
                <div key={`${tag.tag}:${tag.text}`} className="flex gap-1.5 text-xs">
                  <dt className="shrink-0 font-mono text-muted-foreground">@{tag.tag}</dt>
                  <dd className="text-muted-foreground">{tag.text}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function InferredCallout({ text }: { text: string }): JSX.Element {
  return (
    <p className="rounded-md border border-(--tp-inferred)/40 bg-(--tp-inferred)/5 px-3 py-2 text-(--tp-inferred) text-xs">
      {text}
    </p>
  );
}

function MembersDisclosure({ nodeId, locale }: { nodeId: string; locale: string }): JSX.Element {
  const t = useTranslations('Graph.panel');
  const [open, setOpen] = useState(false);
  const { data, isFetching, isError } = useGraphDeclarations(nodeId, locale, open);
  const buckets = data !== undefined ? declarationBuckets(data.items) : { locals: [], nested: [] };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-md border border-border px-2.5 py-1 text-muted-foreground text-xs hover:text-foreground"
      >
        {t('showMembers')}
      </button>
    );
  }
  if (isError && data === undefined) {
    return <p className="text-destructive text-sm">{t('lazyError')}</p>;
  }
  if (isFetching && data === undefined) {
    return <p className="text-muted-foreground text-sm">{t('loading')}</p>;
  }
  return (
    <>
      <Section title={t('localVariables')} count={buckets.locals.length} emptyLabel={t('none')}>
        {buckets.locals.map((row) => (
          <InterfaceItem key={row.id} row={row} />
        ))}
      </Section>
      <Section title={t('nestedFunctions')} count={buckets.nested.length} emptyLabel={t('none')}>
        {buckets.nested.map((row) => (
          <InterfaceItem key={row.id} row={row} />
        ))}
      </Section>
    </>
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
      <span className="truncate font-mono" title={row.label}>
        {row.label}
        {row.optional === true ? '?' : ''}
        {row.type !== undefined ? (
          <span className="text-muted-foreground">: {row.type}</span>
        ) : null}
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
  trustLabel: TrustLabel;
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
  const tl = useTranslations('Graph.legend');
  const rows = page !== undefined ? blastRows(page) : [];
  // Per-hit trust (ADR-0021): a solid mark = a proven chain reaches this dependent
  // (certainly impacted); a dashed mark = every path is inferred (possibly
  // impacted). This replaces the old panel-level caveat with a real distinction.
  const trustLabel: TrustLabel = (kind) =>
    kind === 'inferred' ? tl('inferred') : tl('deterministic');
  return (
    <section className="mb-5 rounded-lg border border-(--toopo-impact)/50 bg-(--toopo-impact)/5 p-3">
      <h3 className="mb-2 font-medium text-(--toopo-impact) text-sm">{tb('title')}</h3>
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
                className="flex items-center gap-2 rounded-md border border-border border-l-2 px-2 py-1 text-sm"
                style={{ borderLeftColor: TRUST_COLOR_VAR[row.pathResolution] }}
              >
                <TrustMark kind={row.pathResolution} label={trustLabel(row.pathResolution)} />
                <span className="min-w-0 flex-1 truncate" title={row.label ?? row.nodeId}>
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
  locale,
  trustLabel,
}: {
  row: CallSiteRow;
  locale: string;
  trustLabel: TrustLabel;
}): JSX.Element {
  const t = useTranslations('Graph.panel');
  const [open, setOpen] = useState(false);
  const { data, isFetching, isError } = useGraphCallBindings(row.id, locale, open);
  const bindings = data !== undefined ? callBindingRows(data.bindings) : [];
  return (
    <li className="rounded-md border border-border px-2 py-1.5 text-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 font-mono text-xs"
      >
        <span className="truncate">{row.callee}(…)</span>
        <span className="shrink-0 text-muted-foreground">{row.args.length}</span>
      </button>
      {open ? (
        isError && data === undefined ? (
          <p className="mt-1 text-destructive text-xs">{t('lazyError')}</p>
        ) : isFetching && data === undefined ? (
          <p className="mt-1 text-muted-foreground text-xs">{t('loading')}</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1 pl-1">
            {bindings.map((binding) => (
              <BindingItem key={binding.ordinal} binding={binding} trustLabel={trustLabel} />
            ))}
          </ul>
        )
      ) : null}
    </li>
  );
}

function BindingItem({
  binding,
  trustLabel,
}: {
  binding: BindingRow;
  trustLabel: TrustLabel;
}): JSX.Element {
  const t = useTranslations('Graph.panel');
  const argLabel = binding.argName ?? `#${binding.ordinal}`;
  return (
    <li
      className="flex items-center gap-2 border-l-2 pl-2 text-xs"
      style={{ borderLeftColor: TRUST_COLOR_VAR[binding.trustKind] }}
    >
      <TrustMark
        kind={binding.trustKind}
        {...(binding.confidence !== undefined ? { confidence: binding.confidence } : {})}
        label={trustLabel(binding.trustKind)}
      />
      <span
        className="truncate font-mono text-muted-foreground"
        title={binding.argValue ?? argLabel}
      >
        {argLabel}
        {binding.argValue !== undefined ? `=${binding.argValue}` : ''}
      </span>
      <span aria-hidden="true" className="shrink-0 text-muted-foreground">
        →
      </span>
      <span className="truncate font-mono" title={binding.paramLabel ?? t('unbound')}>
        {binding.paramLabel ?? <span className="text-(--tp-inferred) italic">{t('unbound')}</span>}
      </span>
    </li>
  );
}
