'use client';

/**
 * D5 (ADR-0029) — the name-collision Insight: top-level declarations that share a
 * name, grouped under that name. This view is ALL CERTAIN — a declaration's
 * existence is a parse fact — so it carries no trust accent (the accent is
 * reserved for uncertainty elsewhere in Insights). The API returns rows already
 * ordered by `(name, id)`, so consecutive rows group cleanly under each name.
 */
import type { NodePage } from '@toopo/api-contracts';
import { useTranslations } from 'next-intl';
import type { JSX } from 'react';
import { useGraphNameCollisions } from '../../../lib/graph/use-graph-queries';

type CollisionNode = NodePage['items'][number];

/** Group rows by name, preserving the API's `(name, id)` order within each group. */
function groupByName(items: readonly CollisionNode[]): Map<string, CollisionNode[]> {
  const groups = new Map<string, CollisionNode[]>();
  for (const node of items) {
    const key = node.kind === 'symbol' ? (node.name ?? '') : '';
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [node]);
    } else {
      bucket.push(node);
    }
  }
  return groups;
}

export function NameCollisionsSection({ locale }: { locale: string }): JSX.Element {
  const t = useTranslations('Insights');
  const query = useGraphNameCollisions(locale);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <header className="mb-3 flex flex-col gap-1">
        <h2 className="font-semibold text-foreground text-lg tracking-tight">
          {t('collisions.title')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('collisions.description')}</p>
      </header>
      <Body locale={locale} query={query} t={t} />
    </section>
  );
}

function Body({
  query,
  t,
}: {
  locale: string;
  query: ReturnType<typeof useGraphNameCollisions>;
  t: ReturnType<typeof useTranslations<'Insights'>>;
}): JSX.Element {
  if (query.isPending) {
    return <p className="text-muted-foreground text-sm">{t('loading')}</p>;
  }
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : t('unknownError');
    return <p className="text-inferred text-sm">{t('error', { message })}</p>;
  }
  const groups = [...groupByName(query.data.items)];
  if (groups.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('collisions.empty')}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {groups.map(([name, nodes]) => (
          <CollisionGroup key={name} name={name} nodes={nodes} t={t} />
        ))}
      </ul>
      {query.data.nextCursor !== null ? (
        <p className="text-faint text-xs">{t('collisions.more')}</p>
      ) : null}
    </div>
  );
}

function CollisionGroup({
  name,
  nodes,
  t,
}: {
  name: string;
  nodes: readonly CollisionNode[];
  t: ReturnType<typeof useTranslations<'Insights'>>;
}): JSX.Element {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="font-medium font-mono text-foreground text-sm">
          {name === '' ? t('collisions.unnamed') : name}
        </span>
        <span className="text-faint text-xs">{t('collisions.count', { count: nodes.length })}</span>
      </div>
      <ul className="flex flex-col gap-1">
        {nodes.map((node) => (
          <li
            key={node.id}
            className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
          >
            <span className="truncate font-mono text-muted-foreground text-xs" title={node.id}>
              {node.id}
            </span>
            {node.kind === 'symbol' && node.subKind !== undefined ? (
              <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">
                {node.subKind}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </li>
  );
}
