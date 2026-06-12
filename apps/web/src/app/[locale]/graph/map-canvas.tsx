'use client';

/**
 * The React Flow canvas itself, inside the provider so it can drive the viewport.
 * It re-fits the view whenever the displayed graph's node set changes, once the
 * nodes are measured, so every level/scope lands centred with comfortable padding
 * rather than parked off to one side. `maxZoom: 1` keeps a tiny graph from
 * ballooning to fill the canvas.
 */
import {
  Background,
  Controls,
  type EdgeTypes,
  MiniMap,
  type NodeMouseHandler,
  type NodeTypes,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import { type JSX, useEffect, useRef } from 'react';
import type { MapFlowEdge, MapFlowNode } from '../../../lib/graph/map-adapter';

interface MapCanvasProps {
  readonly nodes: MapFlowNode[];
  readonly edges: MapFlowEdge[];
  readonly nodeTypes: NodeTypes;
  readonly edgeTypes: EdgeTypes;
  readonly onNodeClick?: (nodeId: string) => void;
  /** Hover enter/leave drive the focus-neighbourhood dim (null = left the node). */
  readonly onNodeHover?: (nodeId: string | null) => void;
}

export function MapCanvas({
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  onNodeClick,
  onNodeHover,
}: MapCanvasProps): JSX.Element {
  const { fitView } = useReactFlow();
  const lastFit = useRef<string | null>(null);

  // Re-fit once per view. The trigger is the node-ID SET, which changes exactly
  // when a level/scope swaps in a new graph — NOT the URL level/scope (which
  // updates before the async layout sets the nodes, so fitting on it would centre
  // the stale graph) and NOT the node array identity (which churns on every
  // hover/focus re-render). Nodes carry explicit dimensions (see the adapter), so
  // a deferred fit lands correctly without waiting on a measure pass; the two
  // frames let React Flow apply the swapped set first. Every view lands centred —
  // the few-node, zero-edge case included.
  const fitKey = nodes.map((node) => node.id).join('|');
  useEffect(() => {
    if (nodes.length === 0 || lastFit.current === fitKey) {
      return;
    }
    lastFit.current = fitKey;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void fitView({ padding: 0.2, duration: 300, maxZoom: 1 });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [fitKey, nodes.length, fitView]);

  const handleNodeClick: NodeMouseHandler<MapFlowNode> = (_event, node) => {
    onNodeClick?.(node.id);
  };
  const handleNodeMouseEnter: NodeMouseHandler<MapFlowNode> = (_event, node) => {
    onNodeHover?.(node.id);
  };
  const handleNodeMouseLeave: NodeMouseHandler<MapFlowNode> = () => {
    onNodeHover?.(null);
  };

  return (
    <ReactFlow
      className="toopo-graph-canvas"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={handleNodeClick}
      onNodeMouseEnter={handleNodeMouseEnter}
      onNodeMouseLeave={handleNodeMouseLeave}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.1}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
    >
      <Background />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}
