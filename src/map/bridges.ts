import { projectedPath } from './projected-path';
import type { ProjectPoint } from './coordinates';
import type { Point } from './contours';
export interface Bridge {
  start: Point;
  end: Point;
  control1: Point;
  control2: Point;
  width: number;
}
interface Tip {
  point: Point;
  direction: Point;
  width: number;
  component: number;
}
// Sync bitmaps have no ordered GPS samples. Only join short, aligned gaps between
// separate elongated components; do not connect parallel tracks or interior holes.
export function connectContours(rings: Point[][], maxGap = 6): Bridge[] {
  const tips: Tip[] = [];
  rings.forEach((ring, component) => {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    if (area <= 0) return;
    const center: Point = [
      ring.reduce((s, p) => s + p[0], 0) / ring.length,
      ring.reduce((s, p) => s + p[1], 0) / ring.length,
    ];
    let xx = 0,
      yy = 0,
      xy = 0;
    for (const p of ring) {
      const x = p[0] - center[0],
        y = p[1] - center[1];
      xx += x * x;
      yy += y * y;
      xy += x * y;
    }
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy),
      axis: Point = [Math.cos(angle), Math.sin(angle)];
    const along = ring.map((p) => (p[0] - center[0]) * axis[0] + (p[1] - center[1]) * axis[1]);
    const across = ring.map((p) => -(p[0] - center[0]) * axis[1] + (p[1] - center[1]) * axis[0]);
    const lo = Math.min(...along),
      hi = Math.max(...along),
      width = Math.max(...across) - Math.min(...across);
    if (width <= 0 || hi - lo < width * 1.8) return;
    for (const sign of [-1, 1]) {
      const extreme = sign < 0 ? lo : hi;
      const cap = ring.filter(
        (_, i) => Math.abs(along[i] - extreme) <= Math.min(0.75, width * 0.25),
      );
      const point: Point = [
        cap.reduce((s, p) => s + p[0], 0) / cap.length,
        cap.reduce((s, p) => s + p[1], 0) / cap.length,
      ];
      tips.push({ point, direction: [axis[0] * sign, axis[1] * sign], width, component });
    }
  });
  const buckets = new Map<string, number[]>();
  const candidates: { a: number; b: number; distance: number }[] = [];
  tips.forEach((tip, i) => {
    const gx = Math.floor(tip.point[0] / maxGap),
      gy = Math.floor(tip.point[1] / maxGap);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const j of buckets.get(`${gx + dx},${gy + dy}`) ?? []) {
          const other = tips[j];
          if (tip.component === other.component) continue;
          const x = other.point[0] - tip.point[0],
            y = other.point[1] - tip.point[1],
            distance = Math.hypot(x, y);
          if (
            distance < 0.01 ||
            distance > maxGap ||
            Math.max(tip.width, other.width) > Math.min(tip.width, other.width) * 2.5
          )
            continue;
          if (
            (x * tip.direction[0] + y * tip.direction[1]) / distance < 0.8 ||
            (-x * other.direction[0] - y * other.direction[1]) / distance < 0.8
          )
            continue;
          candidates.push({ a: i, b: j, distance });
        }
    const key = `${gx},${gy}`;
    buckets.set(key, [...(buckets.get(key) ?? []), i]);
  });
  const used = new Set<number>(),
    result: Bridge[] = [];
  for (const { a, b, distance } of candidates.sort((a, b) => a.distance - b.distance)) {
    if (used.has(a) || used.has(b)) continue;
    const first = tips[a],
      last = tips[b],
      width = Math.min(first.width, last.width);
    const inset = Math.min(width / 2, 1);
    result.push({
      start: [
        first.point[0] - first.direction[0] * inset,
        first.point[1] - first.direction[1] * inset,
      ],
      end: [last.point[0] - last.direction[0] * inset, last.point[1] - last.direction[1] * inset],
      control1: [
        first.point[0] + (first.direction[0] * distance) / 3,
        first.point[1] + (first.direction[1] * distance) / 3,
      ],
      control2: [
        last.point[0] + (last.direction[0] * distance) / 3,
        last.point[1] + (last.direction[1] * distance) / 3,
      ],
      width,
    });
    used.add(a);
    used.add(b);
  }
  return result;
}
export function bridgePath(bridge: Bridge, project?: ProjectPoint): Path2D {
  const { path, pen } = projectedPath(project);
  pen.moveTo(...bridge.start);
  pen.bezierCurveTo(...bridge.control1, ...bridge.control2, ...bridge.end);
  return path;
}
