import { describe, it, expect } from 'vitest';
import {
  parseFog,
  parseInflated,
  filenameToId,
  tileFilename,
  HEADER,
  BLOCK_BYTES,
  mergeBounds,
} from '../worker/lib/fog';
import { fixture, deflate } from './fixtures';
describe('Fog of World format', () => {
  it('round-trips filenames including one-digit IDs and the last world tile', () => {
    for (const id of [0, 1, 9, 10, 511, 512, 131328, 262143])
      expect(filenameToId(tileFilename(id))).toBe(id);
    expect(() => filenameToId('0000olzz')).toThrow();
  });
  it('decodes compressed tiles at exact bit precision and counts area only for visited pixels', async () => {
    const f = fixture();
    const bytes = await deflate(f.data);
    const result = await parseFog(f.name, new Blob([bytes]).stream());
    expect(result.tile.blocks).toEqual([{ index: 0, bitmap: f.bitmap }]);
    expect(result.areaM2).toBeGreaterThan(350);
    expect(result.areaM2).toBeLessThan(370);
    expect(result.bounds![0]).toBe(0);
    expect(result.bounds![3]).toBe(0);
  });
  it('corrects area for latitude', () => {
    const equator = parseInflated(256 * 512, fixture().data);
    const north = parseInflated(100 * 512, fixture().data);
    expect(north.areaM2).toBeLessThan(equator.areaM2 * 0.2);
  });
  it('supports empty tiles', () => {
    const result = parseInflated(0, new Uint8Array(HEADER));
    expect(result.bounds).toBeNull();
    expect(result.areaM2).toBe(0);
    expect(result.tile.blocks).toEqual([]);
  });
  it('rejects truncated blocks, invalid indexes and checksum corruption', () => {
    const f = fixture();
    expect(() => parseInflated(f.id, f.data.subarray(0, -1))).toThrow();
    const bad = f.data.slice();
    new DataView(bad.buffer).setUint16(0, 2, true);
    expect(() => parseInflated(f.id, bad)).toThrow();
    bad.set(f.data);
    bad[HEADER + BLOCK_BYTES - 1] ^= 2;
    expect(() => parseInflated(f.id, bad)).toThrow();
  });
  it('interprets a reused block record at each distinct grid position', () => {
    const f = fixture();
    const original = parseInflated(f.id, f.data);
    new DataView(f.data.buffer).setUint16(2, 1, true);
    const reused = parseInflated(f.id, f.data);
    expect(reused.tile.blocks).toHaveLength(2);
    expect(reused.areaM2).toBeCloseTo(original.areaM2 * 2, 6);
  });
  it('rejects corrupt compressed bytes', async () => {
    await expect(parseFog(tileFilename(0), new Blob(['broken']).stream())).rejects.toThrow();
  });
  it('unions geographic bounds without losing extrema', () => {
    expect(mergeBounds([170, -3, 179, 5], [-179, -5, -170, 4])).toEqual([-179, -5, 179, 5]);
  });
});
