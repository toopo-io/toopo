/**
 * Geometry for an orthogonal edge drawn from an ELK-computed route (a polyline of
 * axis-aligned segments that step around the boxes). React Flow hands a custom
 * edge only the source/target handle anchors, not the route — so the explorer
 * threads ELK's `edgeRoutes` onto each edge and this turns the points into an SVG
 * path plus a label anchor at the route's arc-length midpoint. Pure and testable:
 * no React, no DOM.
 */
export interface OrthogonalEdgeGeometry {
  readonly path: string;
  readonly labelX: number;
  readonly labelY: number;
}

export interface EdgePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The SVG path and label anchor for a route, or `null` when the route has fewer
 * than two points (nothing to draw) — the caller then falls back to a direct path.
 */
export function orthogonalEdgePath(points: readonly EdgePoint[]): OrthogonalEdgeGeometry | null {
  if (points.length < 2) {
    return null;
  }
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${r(point.x)},${r(point.y)}`)
    .join(' ');
  const label = arcLengthMidpoint(points);
  return { path, labelX: label.x, labelY: label.y };
}

/** The point halfway along the polyline by arc length — a stable label anchor. */
function arcLengthMidpoint(points: readonly EdgePoint[]): EdgePoint {
  const segments: { readonly from: EdgePoint; readonly to: EdgePoint; readonly length: number }[] =
    [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    if (from === undefined || to === undefined) {
      continue;
    }
    const length = distance(from, to);
    segments.push({ from, to, length });
    total += length;
  }

  const half = total / 2;
  let travelled = 0;
  for (const segment of segments) {
    if (travelled + segment.length >= half) {
      const ratio = segment.length === 0 ? 0 : (half - travelled) / segment.length;
      return {
        x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
        y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
      };
    }
    travelled += segment.length;
  }
  return points[points.length - 1] ?? { x: 0, y: 0 };
}

function distance(a: EdgePoint, b: EdgePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Round to 2 decimals so the emitted path is compact and deterministic. */
function r(value: number): number {
  return Math.round(value * 100) / 100;
}
