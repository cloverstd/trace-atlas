import { projectedPath } from './projected-path';
import type { ProjectPoint } from './coordinates';
export interface BitmapBlock {
  index: number;
  bitmap: Uint8Array;
}
export type Point = [number, number];
const SIZE = 8192;
const HALO = 8;

// Reconstruct closed boundaries in native map coordinates, including a small halo
// from adjacent tiles. The halo keeps independently rendered tiles seamless.
export function traceContours(
  blocks: BitmapBlock[],
  outside: (x: number, y: number) => boolean = () => false,
): Point[][] {
  const lookup = new Map(blocks.map((b) => [b.index, b.bitmap]));
  const sample = (x: number, y: number): boolean => {
    if (x < -HALO || y < -HALO || x >= SIZE + HALO || y >= SIZE + HALO) return false;
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return outside(x, y);
    const bitmap = lookup.get((y >> 6) * 128 + (x >> 6));
    return !!(bitmap && bitmap[(y & 63) * 8 + ((x & 63) >> 3)] & (128 >> (x & 7)));
  };
  const stride = SIZE + 2 * HALO + 2;
  const key = (x: number, y: number) => (y + HALO) * stride + x + HALO;
  const edges = new Map<number, number>();
  const add = (x: number, y: number, dir: number) => {
    const k = key(x, y);
    edges.set(k, (edges.get(k) ?? 0) | (1 << dir));
  };
  const cell = (x: number, y: number) => {
    if (!sample(x, y - 1)) add(x, y, 0);
    if (!sample(x + 1, y)) add(x + 1, y, 1);
    if (!sample(x, y + 1)) add(x + 1, y + 1, 2);
    if (!sample(x - 1, y)) add(x, y + 1, 3);
  };
  for (const block of blocks) {
    const bx = (block.index % 128) * 64,
      by = Math.floor(block.index / 128) * 64;
    for (let row = 0; row < 64; row++)
      for (let byte = 0; byte < 8; byte++) {
        const bits = block.bitmap[row * 8 + byte];
        if (!bits) continue;
        for (let bit = 0; bit < 8; bit++)
          if (bits & (128 >> bit)) cell(bx + byte * 8 + bit, by + row);
      }
  }
  const border = Array.from({ length: HALO }, (_, i) => [-i - 1, SIZE + i]).flat();
  for (let y = -HALO; y < SIZE + HALO; y++) {
    for (const x of border) if (sample(x, y)) cell(x, y);
  }
  for (let x = 0; x < SIZE; x++) {
    for (const y of border) if (sample(x, y)) cell(x, y);
  }
  const loops: Point[][] = [],
    delta = [1, stride, -1, -stride];
  while (edges.size) {
    const start = edges.keys().next().value!;
    let current = start,
      direction = 0;
    const points: Point[] = [];
    do {
      points.push([(current % stride) - HALO, Math.floor(current / stride) - HALO]);
      const mask = edges.get(current)!;
      // Prefer the right turn at diagonal contacts to keep separate components separate.
      const next = [(direction + 1) % 4, direction, (direction + 3) % 4, (direction + 2) % 4].find(
        (d) => mask & (1 << d),
      )!;
      const remaining = mask & ~(1 << next);
      if (remaining) edges.set(current, remaining);
      else edges.delete(current);
      direction = next;
      current += delta[next];
    } while (current !== start);
    if (points.length >= 4) loops.push(simplifyRing(points));
  }
  return loops;
}
function distanceSquared(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
  );
  return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
}
// Simplify in source coordinates, not screen pixels: stair steps stay removed at every zoom.
export function simplifyRing(points: Point[], tolerance = 0.85): Point[] {
  let split = 1,
    farthest = 0;
  for (let i = 1; i < points.length; i++) {
    const d = (points[i][0] - points[0][0]) ** 2 + (points[i][1] - points[0][1]) ** 2;
    if (d > farthest) {
      farthest = d;
      split = i;
    }
  }
  const ring = [...points, points[0]],
    keep = new Set([0, split, points.length]);
  const stack = [
    [0, split],
    [split, points.length],
  ];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let max = tolerance * tolerance,
      index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distanceSquared(ring[i], ring[first], ring[last]);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index !== -1) {
      keep.add(index);
      stack.push([first, index], [index, last]);
    }
  }
  const result = [...keep]
    .sort((a, b) => a - b)
    .slice(0, -1)
    .map((i) => points[i]);
  return result.length >= 3 ? result : points;
}

// Quadratic curves round the remaining corners with a bounded source-space radius.
export function contourPath(loops: Point[][], project?: ProjectPoint): Path2D {
  const { path, pen } = projectedPath(project);
  for (const points of loops) {
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i + points.length - 1) % points.length],
        p = points[i],
        next = points[(i + 1) % points.length];
      const before = Math.hypot(prev[0] - p[0], prev[1] - p[1]),
        after = Math.hypot(next[0] - p[0], next[1] - p[1]);
      const radius = Math.min(1.5, before / 2, after / 2);
      const ax = p[0] + ((prev[0] - p[0]) * radius) / before,
        ay = p[1] + ((prev[1] - p[1]) * radius) / before;
      if (i === 0) pen.moveTo(ax, ay);
      else pen.lineTo(ax, ay);
      pen.quadraticCurveTo(
        p[0],
        p[1],
        p[0] + ((next[0] - p[0]) * radius) / after,
        p[1] + ((next[1] - p[1]) * radius) / after,
      );
    }
    pen.closePath();
  }
  return path;
}
