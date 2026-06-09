/**
 * Geometry for a trust edge that bows by a FIXED perpendicular distance in
 * pixels, independent of how far apart the two nodes are. React Flow's bezier
 * `curvature` is a FRACTION of the node distance, so two parallel edges between
 * adjacent containers collapse into one ambiguous line — unacceptable for the
 * trust principle (ADR-0015 §8: deterministic vs inferred must be unmistakably
 * two edges). Here the apex is displaced by a constant `offset`, so the solid and
 * dashed edges stay clearly separate at any distance. `offset` is signed: the two
 * trust kinds pass opposite signs to bow to opposite sides. Pure and testable.
 */
export interface ParallelEdgeGeometry {
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
}

export interface ParallelEdgeInput {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
  /** Signed perpendicular apex displacement, in pixels. */
  readonly offset: number;
}

export function parallelEdgePath(input: ParallelEdgeInput): ParallelEdgeGeometry {
  const { sourceX, sourceY, targetX, targetY, offset } = input;
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy);

  if (length === 0 || offset === 0) {
    return {
      path: `M${r(sourceX)},${r(sourceY)} L${r(targetX)},${r(targetY)}`,
      labelX: midX,
      labelY: midY,
    };
  }

  // Unit vector perpendicular to the edge.
  const perpX = -dy / length;
  const perpY = dx / length;
  // For a quadratic bezier the apex (t=0.5) reaches HALF the control point's
  // displacement, so displace the control by 2*offset to bow the apex by offset.
  const controlX = midX + perpX * offset * 2;
  const controlY = midY + perpY * offset * 2;
  const labelX = midX + perpX * offset;
  const labelY = midY + perpY * offset;

  return {
    path: `M${r(sourceX)},${r(sourceY)} Q${r(controlX)},${r(controlY)} ${r(targetX)},${r(targetY)}`,
    labelX,
    labelY,
  };
}

/** Round to 2 decimals so the emitted path is compact and deterministic. */
function r(value: number): number {
  return Math.round(value * 100) / 100;
}
