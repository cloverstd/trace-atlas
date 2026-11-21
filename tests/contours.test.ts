import { expect, it } from 'vitest';
import { traceContours, type BitmapBlock } from '../src/map/contours';
function bitmap(predicate: (x: number, y: number) => boolean, index = 0): BitmapBlock {
  const bitmap = new Uint8Array(512);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) if (predicate(x, y)) bitmap[y * 8 + (x >> 3)] |= 128 >> (x & 7);
  return { index, bitmap };
}
it('replaces a long diagonal staircase with a compact contour in source coordinates', () => {
  const rings = traceContours([
    bitmap((x, y) => x >= 4 && x < 60 && y >= 4 && y < 60 && Math.abs(x - y) <= 3),
  ]);
  expect(rings).toHaveLength(1);
  expect(rings[0].length).toBeLessThan(16);
  expect(Math.max(...rings[0].map((p) => p[0]))).toBe(60);
});
it('preserves isolated pixels, thin tracks, and holes', () => {
  expect(traceContours([bitmap((x, y) => x === y && x < 2)])).toHaveLength(2);
  expect(traceContours([bitmap((x, y) => x === 10 && y > 4 && y < 60)])).toHaveLength(1);
  const rings = traceContours([
    bitmap((x, y) => x > 4 && x < 60 && y > 4 && y < 60 && !(x > 20 && x < 40 && y > 20 && y < 40)),
  ]);
  expect(rings).toHaveLength(2);
  expect(rings.every((r) => r.length >= 4)).toBe(true);
});
it('joins native blocks and uses neighboring tile pixels beyond the clipping boundary', () => {
  expect(traceContours([bitmap(() => true), bitmap(() => true, 1)])).toHaveLength(1);
  const rings = traceContours(
    [bitmap((x, y) => y >= 8 && y < 16, 127)],
    (x, y) => x >= 8192 && y >= 8 && y < 16,
  );
  expect(rings).toHaveLength(1);
  expect(Math.max(...rings[0].map((p) => p[0]))).toBeGreaterThan(8192);
});
