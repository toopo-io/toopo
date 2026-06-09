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
import {
  Background,
  Controls,
  type EdgeTypes,
  MarkerType,
  MiniMap,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { MapLevel, MapView } from '@toopo/api-contracts';
import { useLocale, useTranslations } from 'next-intl';
import { type JSX, type ReactNode, useEffect, useState } from 'react';
import { layoutGraph } from '../../../lib/graph/elk-layout';
import {
  MAP_NODE_SIZE,
  type MapFlowEdge,
  type MapFlowNode,
  mapViewToFlowEdges,
  mapViewToFlowNodes,
} from '../../../lib/graph/map-adapter';
import { useGraphMap } from '../../../lib/graph/use-graph-queries';
import './graph.css';
import { MapContainerNode } from './map-container-node';
import { TrustEdge } from './trust-edge';
import { TrustLegend } from './trust-legend';

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

  const { data, isLoading, error } = useGraphMap(
    { level: initialLevel },
    locale,
    initialMap ?? undefined,
  );

  const [nodes, setNodes] = useState<MapFlowNode[]>([]);
  const [edges, setEdges] = useState<MapFlowEdge[]>([]);

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
      {data?.truncated ? (
        <div
          role="status"
          className="absolute top-3 left-3 z-10 max-w-md rounded-lg border border-(--toopo-trust-inferred) bg-card/90 px-3 py-2 text-xs shadow-sm backdrop-blur"
        >
          {t('truncated')}
        </div>
      ) : null}
      <TrustLegend />
      <ReactFlowProvider>
        <ReactFlow
          className="toopo-graph-canvas"
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          minZoom={0.1}
          maxZoom={2}
        >
          <Background />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </ReactFlowProvider>
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
