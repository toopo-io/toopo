'use client';

/**
 * A dependency edge on the V1 map, drawn in the trust visual language
 * (ADR-0015 §8): solid for deterministic, dashed for inferred. The route is the
 * ELK-computed orthogonal polyline (threaded onto the edge after layout), so the
 * wire steps cleanly around the boxes; when no route is available it falls back
 * to the fixed-offset parallel curve, which keeps a deterministic/inferred pair
 * between the same containers from ever collapsing into one ambiguous line. A
 * small badge shows the projected count of underlying edges this aggregate
 * represents.
 */
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import type { JSX } from 'react';
import type { MapFlowEdge } from '../../../lib/graph/map-adapter';
import { orthogonalEdgePath } from '../../../lib/graph/orthogonal-edge-path';
import { parallelEdgePath } from '../../../lib/graph/parallel-edge-path';
import { TRUST_COLOR_VAR, TRUST_EDGE_OFFSET, trustEdgeStyle } from '../../../lib/graph/trust';

export function TrustEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  data,
}: EdgeProps<MapFlowEdge>): JSX.Element {
  const trustKind = data?.trustKind ?? 'deterministic';
  const route = data?.points;
  const orthogonal = route !== undefined ? orthogonalEdgePath(route) : null;
  const {
    path: edgePath,
    labelX,
    labelY,
  } = orthogonal ??
  parallelEdgePath({ sourceX, sourceY, targetX, targetY, offset: TRUST_EDGE_OFFSET[trustKind] });

  const style = trustEdgeStyle(trustKind);
  const dimmed = data?.dimmed === true;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={dimmed ? { ...style, opacity: 0.12 } : style}
        {...(markerEnd !== undefined ? { markerEnd } : {})}
      />
      {!dimmed && data !== undefined && data.count > 1 ? (
        <EdgeLabelRenderer>
          <span
            className="nodrag nopan pointer-events-none absolute rounded-full border bg-card px-1.5 py-0.5 font-mono text-[10px] leading-none shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              color: TRUST_COLOR_VAR[trustKind],
              borderColor: TRUST_COLOR_VAR[trustKind],
            }}
          >
            {data.count}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
