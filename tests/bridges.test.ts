import { expect, it } from 'vitest';
import { connectContours } from '../src/map/bridges';
import type { Point } from '../src/map/contours';
const rectangle = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
it('joins facing endpoints with a smooth bridge and bounded width', () => {
  const bridges = connectContours([
    rectangle(0, 0, 8, 2),
    rectangle(11, 0, 8, 2),
    rectangle(22, 0, 8, 2),
  ]);
  expect(bridges).toHaveLength(2);
  expect(bridges[0].width).toBe(2);
  expect(bridges.every((b) => b.start[1] === 1 && b.end[1] === 1)).toBe(true);
});
it('does not join parallel tracks, distant trips, or hole boundaries', () => {
  expect(connectContours([rectangle(0, 0, 8, 2), rectangle(0, 4, 8, 2)])).toHaveLength(0);
  expect(connectContours([rectangle(0, 0, 8, 2), rectangle(30, 0, 8, 2)])).toHaveLength(0);
  expect(connectContours([rectangle(0, 0, 8, 2), rectangle(11, 0, 8, 2).reverse()])).toHaveLength(
    0,
  );
});
