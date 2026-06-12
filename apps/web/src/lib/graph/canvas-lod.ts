/**
 * Level-of-detail for the cartography canvas. Seen from far out — a dense map at
 * low zoom — a node's secondary detail (its child count and kind badge) is
 * illegible noise that still costs layout and paint, so it fades out below a
 * threshold; the name always stays. Keeping the decision a pure function of zoom
 * makes it testable AND lets a node subscribe to a STABLE boolean: it re-renders
 * only when the threshold is crossed, never on every zoom delta — the property
 * that keeps hundreds of nodes smooth while zooming.
 */
export const LOD_DETAIL_ZOOM = 0.55;

export function lodShowsDetail(zoom: number): boolean {
  return zoom >= LOD_DETAIL_ZOOM;
}
