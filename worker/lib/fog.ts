// Format research: CaviarChen/Fog-of-World-Data-Parser (MIT), see THIRD_PARTY_NOTICES.md.
import { Md5 } from 'ts-md5';
import { base64 } from './crypto';
import type { Bounds, FogTile } from '../../shared/types';
const MASK1 = 'olhwjsktri',
  MASK2 = 'eizxdwknmo';
export const WORLD = 2 ** 22,
  HEADER = 128 * 128 * 2,
  BLOCK_BYTES = 515;
const MAX_INFLATED = HEADER + 16384 * BLOCK_BYTES;
const POP = Uint8Array.from({ length: 256 }, (_, i) => i.toString(2).replaceAll('0', '').length);
export function tileFilename(id: number): string {
  const s = String(id);
  return (
    Md5.hashStr(s).slice(0, 4) +
    [...s].map((c) => MASK1[Number(c)]).join('') +
    [...s.slice(-2)].map((c) => MASK2[Number(c)]).join('')
  );
}
export function filenameToId(name: string): number {
  if (!/^[0-9a-f]{4}[a-z]+$/.test(name)) throw new Error('无效的迷雾文件名');
  // IDs below 10 have a one-character suffix.
  for (const suffix of [2, 1]) {
    const digits = [...name.slice(4, -suffix)].map((c) => MASK1.indexOf(c));
    if (!digits.length || digits.some((d) => d < 0)) continue;
    const id = Number(digits.join(''));
    if (id < 512 * 512 && tileFilename(id) === name) return id;
  }
  throw new Error('迷雾文件名校验失败');
}
export function lng(x: number) {
  return (x / WORLD) * 360 - 180;
}
export function lat(y: number) {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / WORLD))) * 180) / Math.PI;
}
export async function readBounded(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      n += r.value.length;
      if (n > limit) throw new Error('文件超过格式允许的大小');
      chunks.push(r.value);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(n);
  let p = 0;
  for (const chunk of chunks) {
    data.set(chunk, p);
    p += chunk.length;
  }
  return data;
}
export async function parseFog(name: string, stream: ReadableStream<Uint8Array>) {
  const id = filenameToId(name);
  const inflater = new DecompressionStream('deflate') as unknown as ReadableWritablePair<
    Uint8Array,
    Uint8Array
  >;
  const bytes = await readBounded(stream.pipeThrough(inflater), MAX_INFLATED);
  return parseInflated(id, bytes);
}
export function parseInflated(id: number, bytes: Uint8Array) {
  if (bytes.length < HEADER || (bytes.length - HEADER) % BLOCK_BYTES !== 0)
    throw new Error('迷雾文件长度无效');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tile: FogTile = { format: 1, id, x: id % 512, y: Math.floor(id / 512), blocks: [] };
  const overview = new Uint8Array(2048);
  const rowAreas = new Float64Array(8192);
  let areaM2 = 0,
    minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const radius = 6378137,
    deltaLng = (2 * Math.PI) / WORLD;
  for (let i = 0; i < 16384; i++) {
    const block = view.getUint16(i * 2, true);
    if (!block) continue;
    const start = HEADER + (block - 1) * BLOCK_BYTES;
    if (start + BLOCK_BYTES > bytes.length) throw new Error('迷雾文件块索引无效');
    const bitmap = bytes.subarray(start, start + 512);
    let count = 0;
    const bx = tile.x * 8192 + (i % 128) * 64,
      by = tile.y * 8192 + Math.floor(i / 128) * 64;
    for (let row = 0; row < 64; row++) {
      let rowCount = 0;
      for (let col = 0; col < 8; col++) {
        const b = bitmap[row * 8 + col];
        rowCount += POP[b];
        if (!b) continue;
        minX = Math.min(minX, bx + col * 8 + Math.clz32(b) - 24);
        maxX = Math.max(maxX, bx + col * 8 + 8 - (31 - Math.clz32(b & -b)));
      }
      if (rowCount) {
        minY = Math.min(minY, by + row);
        maxY = Math.max(maxY, by + row + 1);
        const localRow = Math.floor(i / 128) * 64 + row;
        if (!rowAreas[localRow]) {
          const north = (lat(by + row) * Math.PI) / 180,
            south = (lat(by + row + 1) * Math.PI) / 180;
          rowAreas[localRow] = radius * radius * deltaLng * (Math.sin(north) - Math.sin(south));
        }
        areaM2 += rowCount * rowAreas[localRow];
      }
      count += rowCount;
    }
    const checksum = ((bytes[start + 513] << 8) | bytes[start + 514]) & 0x3fff;
    if (checksum !== (count << 1) + 1) throw new Error('迷雾位图校验失败');
    if (count) {
      overview[i >> 3] |= 128 >> (i % 8);
      tile.blocks.push({ index: i, bitmap: base64(bitmap) });
    }
  }
  const bounds: Bounds | null = Number.isFinite(minX)
    ? [lng(minX), lat(maxY), lng(maxX), lat(minY)]
    : null;
  return { tile, overview: base64(overview), areaM2, bounds };
}
export function mergeBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}
