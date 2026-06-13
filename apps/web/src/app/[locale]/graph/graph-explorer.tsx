'use client';

/**
 * The cartography explorer (ADR-0020 V1–V5): the package → file → symbol map,
 * the node-detail panel, search, and blast-radius.
 *
 * Data flow: `useGraphMap` reads the Serve `/map` view (hydrated from the
 * server-fetched initial data, then kept fresh by React Query) → the pure
 * adapters turn it into React Flow nodes/edges → ELK lays them out
 * deterministically → React Flow renders them with the custom trust-aware node
 * and edge. The chrome (legend, truncated banner, loading/error/empty states)
 * lives in plain DOM around the canvas so it is testable without a WebGL/measure
 * pass. Trust is never merged and always legible (ADR-0015 §8).
 */
import { type EdgeTypes, MarkerType, type NodeTypes, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { MapLevel, MapView } from '@toopo/api-contracts';
import { useLocale, useTranslations } from 'next-intl';
import { type JSX, type ReactNode, useEffect, useMemo, useState } from 'react';
import { edgeTouchesFocus, focusNeighbourhood } from '../../../lib/graph/canvas-focus';
import { layoutGraph } from '../../../lib/graph/elk-layout';
import {
  MAP_NODE_SIZE,
  type MapEdgeData,
  type MapFlowEdge,
  type MapFlowNode,
  mapViewToFlowEdges,
  mapViewToFlowNodes,
} from '../../../lib/graph/map-adapter';
import { drillTarget, searchJumpState } from '../../../lib/graph/navigation';
import { useGraphBlastRadius, useGraphMap } from '../../../lib/graph/use-graph-queries';
import { ProjectIdProvider } from '../../../lib/projects/project-context';
import './graph.css';
import { useGraphViewState } from '../../../lib/graph/use-graph-view-state';
import { Breadcrumb } from './breadcrumb';
import { IsolateToggle } from './isolate-toggle';
import { LevelSwitcher } from './level-switcher';
import { MapCanvas } from './map-canvas';
import { MapContainerNode } from './map-container-node';
import { NodeDetailPanel } from './node-detail-panel';
import { SearchBox } from './search-box';
import { StatBar } from './stat-bar';
import { TrustEdge } from './trust-edge';
import { TrustLegend } from './trust-legend';
import { useScopeTrail } from './use-scope-trail';

const NODE_TYPES: NodeTypes = { mapContainer: MapContainerNode };
const EDGE_TYPES: EdgeTypes = { trustEdge: TrustEdge };

interface GraphExplorerProps {
  /** The selected project the graph is scoped to (ADR-0022 §5). */
  readonly projectId: string;
  /** The coarsest containment level that actually has nodes (ADR-0015 §2). */
  readonly initialLevel: MapLevel;
  readonly initialMap: MapView | null;
}

/**
 * Provides the project scope above the explorer so every graph query hook reads
 * it from context (the hooks run in {@link GraphExplorerInner}'s body, which must
 * sit under the provider).
 */
export function GraphExplorer({
  projectId,
  initialLevel,
  initialMap,
}: GraphExplorerProps): JSX.Element {
  return (
    <ProjectIdProvider projectId={projectId}>
      <GraphExplorerInner initialLevel={initialLevel} initialMap={initialMap} />
    </ProjectIdProvider>
  );
}

function GraphExplorerInner({
  initialLevel,
  initialMap,
}: Omit<GraphExplorerProps, 'projectId'>): JSX.Element {
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

  const blastActive = state.blast && state.node !== undefined;
  const blast = useGraphBlastRadius(state.node, locale, blastActive);
  // Map each impacted dependent to the trust of the path that reaches it (ADR-0021):
  // the value IS a TrustKind, so the node renders it with the solid/dashed language.
  const impacted = useMemo(
    () => new Map((blast.data?.items ?? []).map((item) => [item.nodeId, item.pathResolution])),
    [blast.data],
  );

  const onToggleBlast = (): void => {
    setState({ ...state, blast: !state.blast });
  };

  const onSelectLevel = (next: MapLevel): void => {
    // Never emit an invalid symbol-without-scope query: the symbol level is only
    // offered when a file scope is active, where re-selecting it keeps that scope.
    if (next === 'symbol') {
      if (scope !== undefined) {
        setState({ level: 'symbol', scope, blast: false });
      }
      return;
    }
    setState({ level: next, blast: false });
  };

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isolateInferred, setIsolateInferred] = useState(false);
  const [nodes, setNodes] = useState<MapFlowNode[]>([]);
  const [edges, setEdges] = useState<MapFlowEdge[]>([]);

  // The blast overlay (a deep trust-aware traversal) takes precedence; otherwise
  // hovering or selecting a node focuses its one-hop neighbourhood (ADR-0021 vs
  // the everyday focus-dim). A null focus means the whole map is lit.
  const focusId = blastActive ? undefined : (hoveredId ?? state.node);
  const neighbourhood = useMemo(
    () => (focusId !== undefined ? focusNeighbourhood(focusId, edges) : null),
    [focusId, edges],
  );

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const impact = blastActive ? impacted.get(node.id) : undefined;
        const blastDim = blastActive && impact === undefined && node.id !== state.node;
        const focusDim = neighbourhood !== null && !neighbourhood.has(node.id);
        return {
          ...node,
          selected: node.id === state.node,
          // `impact` is set only when this node is an impacted dependent — never
          // explicitly `undefined` (exactOptionalPropertyTypes).
          data: {
            ...node.data,
            ...(impact !== undefined ? { impact } : {}),
            dimmed: blastDim || focusDim,
          },
        };
      }),
    [nodes, state.node, blastActive, impacted, neighbourhood],
  );

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const base: MapEdgeData = edge.data ?? { trustKind: 'deterministic', count: 0 };
        const focusDim = focusId !== undefined && !edgeTouchesFocus(edge, focusId);
        const isolateDim = isolateInferred && base.trustKind === 'deterministic';
        return { ...edge, data: { ...base, dimmed: focusDim || isolateDim } };
      }),
    [edges, focusId, isolateInferred],
  );

  const stats = useMemo(
    () => ({
      nodes: nodes.length,
      edges: edges.length,
      inferred: edges.filter((edge) => edge.data?.trustKind === 'inferred').length,
    }),
    [nodes, edges],
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
    ).then((layout) => {
      if (cancelled) {
        return;
      }
      setNodes(
        flowNodes.map((node) => ({
          ...node,
          position: layout.positions.get(node.id) ?? node.position,
        })),
      );
      setEdges(
        flowEdges.map((edge) => {
          const points = layout.edgeRoutes.get(edge.id);
          const base: MapEdgeData = edge.data ?? { trustKind: 'deterministic', count: 0 };
          return {
            ...edge,
            markerEnd: { type: MarkerType.ArrowClosed },
            data: points !== undefined ? { ...base, points } : base,
          };
        }),
      );
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
        <div className="flex flex-wrap items-center gap-2">
          <LevelSwitcher level={level} canSymbol={scope !== undefined} onSelect={onSelectLevel} />
          <IsolateToggle
            active={isolateInferred}
            onToggle={() => setIsolateInferred((on) => !on)}
          />
        </div>
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
      <StatBar nodes={stats.nodes} edges={stats.edges} inferred={stats.inferred} />
      <ReactFlowProvider>
        <MapCanvas
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodeClick={onNodeClick}
          onNodeHover={setHoveredId}
        />
      </ReactFlowProvider>
      {state.node !== undefined ? (
        <NodeDetailPanel
          nodeId={state.node}
          locale={locale}
          blastActive={blastActive}
          onToggleBlast={onToggleBlast}
          blastLoading={blast.isFetching}
          {...(blast.data !== undefined ? { blastPage: blast.data } : {})}
          onClose={() =>
            setState({
              level: state.level,
              ...(state.scope !== undefined ? { scope: state.scope } : {}),
              blast: false,
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
