'use client';

/**
 * A container node on the V1 map (a package, file or symbol). A real React
 * component — rich, themed, and sized deterministically to match the dimensions
 * fed to ELK (`MAP_NODE_SIZE`). The handles are the layered-layout in/out ports
 * (left = incoming, right = outgoing); they are visually muted because the map's
 * focus is the containers and their trust-split edges, not the ports.
 */
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import type { JSX } from 'react';
import { MAP_NODE_SIZE, type MapFlowNode } from '../../../lib/graph/map-adapter';

export function MapContainerNode({ data, selected }: NodeProps<MapFlowNode>): JSX.Element {
  const t = useTranslations('Graph');
  // Blast-radius impact outline (ADR-0021): the impact colour is constant; the
  // STROKE carries trust — a SOLID outline is certainly impacted (a proven chain
  // reaches it), a DASHED outline is possibly impacted (every path is inferred),
  // the same solid/dashed language the map's edges and the panel rows use.
  const border =
    data.impact !== undefined
      ? `border-2 border-(--toopo-impact) ring-2 ring-(--toopo-impact)/40${
          data.impact === 'inferred' ? ' border-dashed' : ''
        }`
      : selected
        ? 'border-ring ring-2 ring-ring/40'
        : 'border-border';
  return (
    <div
      className={`flex cursor-pointer flex-col justify-center gap-1 rounded-lg border bg-card px-4 py-2 text-card-foreground shadow-sm transition-all hover:border-ring/70 ${border} ${
        data.dimmed ? 'opacity-35' : 'opacity-100'
      }`}
      style={{ width: MAP_NODE_SIZE.width, height: MAP_NODE_SIZE.height }}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground/40" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-sm" title={data.label}>
          {data.label}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          {data.kind}
        </span>
      </div>
      <span className="text-muted-foreground text-xs">
        {t('node.children', { count: data.childCount })}
      </span>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground/40" />
    </div>
  );
}
