/**
 * Catmull-Rom → cubic Bezier conversion, for turning a sparse set of ridge
 * control points into a smooth SVG path. Kept dependency-free — this is the
 * one piece of math the ridge visual leans on, and it is small enough to
 * read in full.
 */

export type Point = { x: number; y: number };

/** `closedBaseline` is the y value the path is closed down to, for a fill. */
export function smoothAreaPath(points: Point[], closedBaseline: number): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${closedBaseline} L ${p.x} ${p.y} L ${p.x} ${closedBaseline} Z`;
  }

  let d = `M ${points[0].x} ${closedBaseline} L ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }

  const last = points[points.length - 1];
  d += ` L ${last.x} ${closedBaseline} Z`;
  return d;
}

/** Same interpolation, open (no fill, no baseline) — for hairlines. */
export function smoothLinePath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}
