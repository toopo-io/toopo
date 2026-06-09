'use client';

/**
 * The cartography explorer (ADR-0020 V1, S1 scope: the package-level map).
 *
 * Data flow: `useGraphMap` reads the Serve `/map` view (hydrated from the
 * server-fetched initial data, then kept fresh by React Query) → the pure
 * adapters turn it into React Flow nodes/edges → ELK lays them out
 * deterministically → React Flow renders them with the custom trust-aware node
 * and edge. The chrome (legend, truncated banner, loading/error/empty states)
 * lives in plain DOM around the canvas so it is testable without a WebGL/measure
 * pass. Trust is never merged and always legible (ADR-0015 §8).
 *
 * Later slices add drill-down (file/symbol), the detail panel, search and
 * blast-radius; this slice is intentionally the package map only.
 */
import { type EdgeTypes, MarkerType, type NodeTypes, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { MapLevel, MapView } from '@toopo/api-contracts';
import { useLocale, useTranslations } from 'next-intl';
import { type JSX, type ReactNode, useEffect, useMemo, useState } from 'react';
import { layoutGraph } from '../../../lib/graph/elk-layout';
import {
  MAP_NODE_SIZE,
  type MapFlowEdge,
  type MapFlowNode,
  mapViewToFlowEdges,
  mapViewToFlowNodes,
} from '../../../lib/graph/map-adapter';
import { drillTarget, searchJumpState } from '../../../lib/graph/navigation';
import { useGraphMap } from '../../../lib/graph/use-graph-queries';
import './graph.css';
import { useGraphViewState } from '../../../lib/graph/use-graph-view-state';
import { Breadcrumb } from './breadcrumb';
import { MapCanvas } from './map-canvas';
import { MapContainerNode } from './map-container-node';
import { NodeDetailPanel } from './node-detail-panel';
import { SearchBox } from './search-box';
import { TrustEdge } from './trust-edge';
import { TrustLegend } from './trust-legend';
import { useScopeTrail } from './use-scope-trail';

const NODE_TYPES: NodeTypes = { mapContainer: MapContainerNode };
const EDGE_TYPES: EdgeTypes = { trustEdge: TrustEdge };

interface GraphExplorerProps {
  /** The coarsest containment level that actually has nodes (ADR-0015 §2). */
  readonly initialLevel: MapLevel;
  readonly initialMap: MapView | null;
}

export function GraphExplorer({ initialLevel, initialMap }: GraphExplorerProps): JSX.Element {
  const locale = useLocale();
  const t = useTranslations('Graph');
  const { state, setState } = useGraphViewState();

  // The canonical root URL (`/graph`, no scope) shows the coarsest populated
  // tier; once the viewer drills, the URL's level+scope drive the view.
  const atRoot = state.level === 'package' && state.scope === undefined;
  const level = atRoot ? initialLevel : state.level;
  const scope = atRoot ? undefined : state.scope;

  const { data, isLoading, error } = useGraphMap(
    { level, ...(scope !== undefined ? { scope } : {}) },
    locale,
    atRoot ? (initialMap ?? undefined) : undefined,
  );

  const crumbs = useScopeTrail(level, scope, locale, t(`level.${initialLevel}`));

  const onNodeClick = (nodeId: string): void => {
    const target = drillTarget(level, nodeId);
    if (target !== null) {
      setState({ level: target.level, scope: target.scope, blast: false });
    } else {
      // Deepest tier: a click opens the node-detail panel (V2) for this symbol.
      setState({ ...state, node: nodeId });
    }
  };

  const [nodes, setNodes] = useState<MapFlowNode[]>([]);
  const [edges, setEdges] = useState<MapFlowEdge[]>([]);
  const displayNodes = useMemo(
    () => nodes.map((node) => ({ ...node, selected: node.id === state.node })),
    [nodes, state.node],
  );

  useEffect(() => {
    if (data === undefined) {
      return;
    }
    const flowNodes = mapViewToFlowNodes(data);
    const flowEdges = mapViewToFlowEdges(data);
    let cancelled = false;
    void layoutGraph(
      flowNodes.map((node) => ({ id: node.id, ...MAP_NODE_SIZE })),
      flowEdges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    ).then((positions) => {
      if (cancelled) {
        return;
      }
      setNodes(
        flowNodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })),
      );
      setEdges(flowEdges.map((edge) => ({ ...edge, markerEnd: { type: MarkerType.ArrowClosed } })));
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (error) {
    return (
      <StatusBox tone="error">
        {t('error', { message: error instanceof Error ? error.message : t('unknownError') })}
      </StatusBox>
    );
  }
  if (isLoading && data === undefined) {
    return <StatusBox tone="muted">{t('loading')}</StatusBox>;
  }
  if (data !== undefined && data.nodes.length === 0) {
    return <StatusBox tone="muted">{t('empty')}</StatusBox>;
  }

  return (
    <div className="relative h-full w-full">
      <div className="absolute top-3 left-3 z-10 flex max-w-[70%] flex-col gap-2">
        <Breadcrumb crumbs={crumbs} onNavigate={setState} ariaLabel={t('breadcrumb.aria')} />
        {data?.truncated ? (
          <div
            role="status"
            className="max-w-md rounded-lg border border-(--toopo-trust-inferred) bg-card/90 px-3 py-2 text-xs shadow-sm backdrop-blur"
          >
            {t('truncated')}
          </div>
        ) : null}
      </div>
      <div className="-translate-x-1/2 absolute top-3 left-1/2 z-20">
        <SearchBox locale={locale} onJump={(node) => setState(searchJumpState(node, state))} />
      </div>
      <TrustLegend />
      <ReactFlowProvider>
        <MapCanvas
          nodes={displayNodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodeClick={onNodeClick}
        />
      </ReactFlowProvider>
      {state.node !== undefined ? (
        <NodeDetailPanel
          nodeId={state.node}
          locale={locale}
          onClose={() =>
            setState({
              level: state.level,
              ...(state.scope !== undefined ? { scope: state.scope } : {}),
              blast: state.blast,
            })
          }
        />
      ) : null}
    </div>
  );
}

function StatusBox({
  tone,
  children,
}: {
  tone: 'muted' | 'error';
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      role="status"
      className={`flex h-full w-full items-center justify-center px-6 text-center text-sm ${
        tone === 'error' ? 'text-destructive' : 'text-muted-foreground'
      }`}
    >
      {children}
    </div>
  );
}
