'use client';

/**
 * A dependency edge on the V1 map, drawn in the trust visual language
 * (ADR-0015 §8): solid for deterministic, dashed for inferred, the two bowing in
 * opposite directions (`TRUST_CURVATURE`) so a container pair that has both never
 * collapses into one ambiguous line. A small badge shows the projected count of
 * underlying edges this aggregate represents.
 */
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from '@xyflow/react';
import type { JSX } from 'react';
import type { MapFlowEdge } from '../../../lib/graph/map-adapter';
import { TRUST_COLOR_VAR, TRUST_CURVATURE, trustEdgeStyle } from '../../../lib/graph/trust';

export function TrustEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<MapFlowEdge>): JSX.Element {
  const trustKind = data?.trustKind ?? 'deterministic';
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: TRUST_CURVATURE[trustKind],
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={trustEdgeStyle(trustKind)}
        {...(markerEnd !== undefined ? { markerEnd } : {})}
      />
      {data !== undefined && data.count > 1 ? (
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
