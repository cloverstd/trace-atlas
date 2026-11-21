import { describe, it, expect } from 'vitest';
import { tileVisible, worldCopies, maskTransform } from '../src/map/geometry';
import type { View } from '../src/map/types';
const view: View = { left: 100, top: 100, world: 1024, width: 300, height: 200, zoom: 1, id: 0 };
describe('map mask coordinates', () => {
  it('tracks pan and zoom without moving exploration to the wrong location', () => {
    expect(maskTransform(view, { ...view, left: 130, top: 120 })).toEqual({
      scale: [1, 1],
      offset: [0.1, 0.1],
    });
    expect(maskTransform(view, { ...view, world: 2048, left: 200, top: 200 })).toEqual({
      scale: [0.5, 0.5],
      offset: [0, 0],
    });
  });
  it('renders both sides of the dateline and all world copies on a wide viewport', () => {
    expect(tileVisible(511, 60, { ...view, left: 1000, width: 80 })).toBe(true);
    expect(tileVisible(0, 60, { ...view, left: 1000, width: 80 })).toBe(true);
    expect(worldCopies({ ...view, left: 0, width: 4000 })).toContain(4);
    expect(maskTransform({ ...view, left: 1000 }, { ...view, left: -24 }).offset[0]).toBe(0);
  });
});
