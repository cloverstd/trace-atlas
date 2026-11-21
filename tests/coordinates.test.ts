import { describe, expect, it } from 'vitest';
import { toGcj, fromGcj, mercator, lngLat, tileProject } from '../src/map/coordinates';
describe('Tencent display coordinates', () => {
  it('matches a known Beijing conversion and reverses without moving the stored coordinate', () => {
    const converted = toGcj(116.404, 39.915);
    expect(converted[0]).toBeCloseTo(116.4102445, 6);
    expect(converted[1]).toBeCloseTo(39.9164043, 6);
    const original = fromGcj(...converted);
    expect(original[0]).toBeCloseTo(116.404, 8);
    expect(original[1]).toBeCloseTo(39.915, 8);
    expect(toGcj(-0.1276, 51.5072)).toEqual([-0.1276, 51.5072]);
  });
  it('projects full tile geometry, with identical positions on adjacent tile boundaries', () => {
    const left = tileProject(418, 210)(8192, 4000),
      right = tileProject(419, 210)(0, 4000);
    expect(left[0] - 8192).toBeCloseTo(right[0], 8);
    expect(left[1]).toBeCloseTo(right[1], 8);
    const a = tileProject(418, 210)(0, 0),
      b = tileProject(418, 210)(8192, 8192);
    expect(Math.abs(a[0] - (b[0] - 8192))).toBeGreaterThan(0.01);
    const point = lngLat(...mercator(114.3, 30.6));
    expect(point[0]).toBeCloseTo(114.3, 9);
    expect(point[1]).toBeCloseTo(30.6, 9);
  });
});
