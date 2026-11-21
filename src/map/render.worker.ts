/// <reference lib="webworker" />
import type { RenderMessage, View } from './types';
import type { TileOverview } from '../../shared/types';
import { traceContours, contourPath, type BitmapBlock } from './contours';
import { connectContours, bridgePath } from './bridges';
import { tileVisible as visible, worldCopies } from './geometry';
import { tileProject } from './coordinates';
import { projectedPath } from './projected-path';
const decode = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const overviews = new Map<number, { x: number; y: number; occupied: number[] }>();
const details = new Map<
  number,
  {
    x: number;
    y: number;
    blocks: BitmapBlock[];
    lookup: Map<number, Uint8Array>;
    path?: Path2D;
    gcj?: boolean;
    bridges?: { path: Path2D; width: number }[];
    pathBytes?: number;
    bytes: number;
  }
>();
let canvas: OffscreenCanvas | undefined,
  context: OffscreenCanvasRenderingContext2D | null = null,
  bytes = 0;
function render(v: View) {
  const ratio = v.pixelRatio ?? 1;
  const width = Math.round(v.width * ratio),
    height = Math.round(v.height * ratio);
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas = new OffscreenCanvas(width, height);
    context = canvas.getContext('2d');
  }
  const ctx = context!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, v.width, v.height);
  const scale = v.world / 2 ** 22,
    blockSize = 64 * scale;
  for (const [id, tile] of overviews) {
    if (!visible(tile.x, tile.y, v)) continue;
    const detail = details.get(id);
    if (v.zoom > 7 && !detail) continue;
    if (detail) {
      details.delete(id);
      details.set(id, detail);
    }
    const project = v.gcj ? tileProject(tile.x, tile.y) : undefined;
    const y0 = tile.y * 8192 * scale - v.top;
    for (const w of worldCopies(v)) {
      const x0 = tile.x * 8192 * scale + w * v.world - v.left;
      const pad = v.gcj ? v.world * 0.00006 : 0;
      if (x0 > v.width + pad || x0 + 8192 * scale < -pad) continue;
      if (v.zoom <= 7) {
        for (const index of tile.occupied) {
          const p = project?.((index % 128) * 64, Math.floor(index / 128) * 64);
          const x = x0 + (p ? p[0] * scale : (index % 128) * blockSize),
            y = y0 + (p ? p[1] * scale : Math.floor(index / 128) * blockSize);
          if (x >= -blockSize && x <= v.width && y >= -blockSize && y <= v.height)
            ctx.clearRect(
              Math.floor(x),
              Math.floor(y),
              Math.max(1, Math.ceil(blockSize)),
              Math.max(1, Math.ceil(blockSize)),
            );
        }
        continue;
      }
      if (!detail!.path || detail!.gcj !== v.gcj) {
        bytes -= detail!.pathBytes ?? 0;
        detail!.bytes -= detail!.pathBytes ?? 0;
        detail!.gcj = v.gcj;
        const contours = traceContours(detail!.blocks, (x, y) => {
          const tx = (((tile.x + Math.floor(x / 8192)) % 512) + 512) % 512;
          const ty = tile.y + Math.floor(y / 8192);
          if (ty < 0 || ty >= 512) return false;
          const neighbor = details.get(ty * 512 + tx);
          if (!neighbor) return false;
          const px = (x + 8192) % 8192,
            py = (y + 8192) % 8192;
          const bits = neighbor.lookup.get((py >> 6) * 128 + (px >> 6));
          return !!(bits && bits[(py & 63) * 8 + ((px & 63) >> 3)] & (128 >> (px & 7)));
        });
        detail!.path = contourPath(contours, project);
        detail!.bridges = connectContours(contours).map((bridge) => ({
          path: bridgePath(bridge, project),
          width: bridge.width,
        }));
        detail!.pathBytes = contours.reduce((sum, ring) => sum + ring.length * 64, 0);
        detail!.bytes += detail!.pathBytes;
        bytes += detail!.pathBytes;
      }
      ctx.save();
      ctx.translate(x0, y0);
      ctx.scale(scale, scale);
      const clip = projectedPath(project);
      clip.pen.moveTo(0, 0);
      clip.pen.lineTo(8192, 0);
      clip.pen.lineTo(8192, 8192);
      clip.pen.lineTo(0, 8192);
      clip.pen.closePath();
      ctx.clip(clip.path);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill(detail!.path, 'evenodd');
      const extraWidth = ((v.pathWidth ?? 2) - 1) * 0.75;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (extraWidth > 0) {
        ctx.lineWidth = extraWidth;
        ctx.stroke(detail!.path);
      }
      for (const bridge of detail!.bridges ?? []) {
        ctx.lineWidth = bridge.width + extraWidth;
        ctx.stroke(bridge.path);
      }
      ctx.restore();
    }
  }
  const bitmap = canvas.transferToImageBitmap();
  self.postMessage({ type: 'frame', id: v.id, view: v, bitmap }, [bitmap]);
  const evicted: number[] = [];
  for (const [id, t] of details) {
    if (details.size <= 16 && bytes <= 64 * 1024 * 1024) break;
    if (visible(t.x, t.y, v)) continue;
    details.delete(id);
    bytes -= t.bytes;
    evicted.push(id);
  }
  if (evicted.length) self.postMessage({ type: 'evicted', ids: evicted });
}
function addOverview(tiles: TileOverview[]) {
  for (const tile of tiles) {
    const bitmap = decode(tile.bitmap),
      occupied: number[] = [];
    for (let i = 0; i < 16384; i++) if (bitmap[i >> 3] & (128 >> (i % 8))) occupied.push(i);
    overviews.set(tile.id, { x: tile.x, y: tile.y, occupied });
  }
}
self.onmessage = (event: MessageEvent<RenderMessage>) => {
  const message = event.data;
  try {
    if (message.type === 'overview') addOverview(message.tiles);
    else if (message.type === 'tile') {
      const blocks = message.tile.blocks.map((b) => ({ ...b, bitmap: decode(b.bitmap) }));
      bytes -= details.get(message.tile.id)?.bytes ?? 0;
      const size = blocks.length * 512;
      details.set(message.tile.id, {
        ...message.tile,
        blocks,
        lookup: new Map(blocks.map((b) => [b.index, b.bitmap])),
        bytes: size,
      });
      // Refresh shared borders when an adjacent tile becomes available.
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const neighbor = details.get(
            (message.tile.y + dy) * 512 + ((message.tile.x + dx + 512) % 512),
          );
          if (neighbor) {
            neighbor.path = undefined;
            const released = neighbor.pathBytes ?? 0;
            neighbor.bytes -= released;
            bytes -= released;
            neighbor.pathBytes = 0;
          }
        }
      bytes += size;
    } else if (message.type === 'render') render(message.view);
    else {
      overviews.clear();
      details.clear();
      bytes = 0;
    }
  } catch {
    self.postMessage({ type: 'error' });
  }
};
