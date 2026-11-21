import type { ProjectPoint } from './coordinates';
// Subdivide long straight segments before projection so GCJ displacement is not
// approximated as a single tile-wide translation. Curves retain their smoothness.
export function projectedPath(project?: ProjectPoint) {
  const path = new Path2D();
  if (!project) return { path, pen: path };
  let last: [number, number] = [0, 0],
    first: [number, number] = [0, 0];
  const pen = {
    moveTo(x: number, y: number) {
      last = [x, y];
      first = last;
      path.moveTo(...project(x, y));
    },
    lineTo(x: number, y: number) {
      const start = last,
        n = Math.max(1, Math.ceil(Math.hypot(x - start[0], y - start[1]) / 64));
      for (let i = 1; i <= n; i++)
        path.lineTo(
          ...project(start[0] + ((x - start[0]) * i) / n, start[1] + ((y - start[1]) * i) / n),
        );
      last = [x, y];
    },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
      path.quadraticCurveTo(...project(cx, cy), ...project(x, y));
      last = [x, y];
    },
    bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number) {
      path.bezierCurveTo(...project(a, b), ...project(c, d), ...project(x, y));
      last = [x, y];
    },
    closePath() {
      pen.lineTo(...first);
      path.closePath();
    },
  };
  return { path, pen };
}
