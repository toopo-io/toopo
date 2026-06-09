'use client';

/**
 * The React Flow canvas itself, inside the provider so it can drive the viewport.
 * It re-fits the view whenever the displayed graph changes (`fitSignal`) once the
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
  useNodesInitialized,
  useReactFlow,
} from '@xyflow/react';
import { type JSX, useEffect } from 'react';
import type { MapFlowEdge, MapFlowNode } from '../../../lib/graph/map-adapter';

interface MapCanvasProps {
  readonly nodes: MapFlowNode[];
  readonly edges: MapFlowEdge[];
  readonly nodeTypes: NodeTypes;
  readonly edgeTypes: EdgeTypes;
  readonly onNodeClick?: (nodeId: string) => void;
}

export function MapCanvas({
  nodes,
  edges,
  nodeTypes,
  edgeTypes,
  onNodeClick,
}: MapCanvasProps): JSX.Element {
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();

  // Re-fit whenever the laid-out node set changes (a new level/scope produces a
  // new array), once measured — so every view lands centred, not parked aside.
  useEffect(() => {
    if (initialized && nodes.length > 0) {
      void fitView({ padding: 0.2, duration: 300, maxZoom: 1 });
    }
  }, [initialized, nodes, fitView]);

  const handleNodeClick: NodeMouseHandler<MapFlowNode> = (_event, node) => {
    onNodeClick?.(node.id);
  };

  return (
    <ReactFlow
      className="toopo-graph-canvas"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={handleNodeClick}
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
