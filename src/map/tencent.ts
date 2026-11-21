import type { Camera, Engine } from './engine';
import type { View } from './types';
import { fromGcj, toGcj, mercator } from './coordinates';
import { maskTransform } from './geometry';
interface LatLng {
  getLat(): number;
  getLng(): number;
}
interface TencentMap {
  getCenter(): LatLng;
  getZoom(): number;
  setZoom(zoom: number): void;
  projectToContainer(point: LatLng): { x: number; y: number };
  unprojectFromContainer(point: { x: number; y: number }): LatLng;
  on(event: string, cb: () => void): void;
  off(event: string, cb: () => void): void;
  fitBounds(bounds: unknown, options: unknown): void;
  destroy(): void;
}
interface SDK {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => TencentMap;
  LatLng: new (lat: number, lng: number) => LatLng;
  Point: new (x: number, y: number) => { x: number; y: number };
  LatLngBounds: new (sw: LatLng, ne: LatLng) => unknown;
}
declare global {
  interface Window {
    TMap?: SDK;
    traceAtlasTencentReady?: () => void;
  }
}
let sdkPromise: Promise<SDK> | undefined;
export function loadTencent(key: string): Promise<SDK> {
  if (window.TMap) return Promise.resolve(window.TMap);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<SDK>((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // A downloaded script can execute after removal; its callback must remain safe.
      window.traceAtlasTencentReady = () => {};
      if (error) {
        script.remove();
        reject(error);
      } else if (window.TMap) resolve(window.TMap);
      else reject(new Error('腾讯地图初始化失败，请重试。'));
    };
    const timer = setTimeout(
      () => finish(new Error('腾讯地图加载超时，请重试或切换地图。')),
      12000,
    );
    window.traceAtlasTencentReady = () => finish();
    script.onerror = () => finish(new Error('腾讯地图加载失败，请重试或切换地图。'));
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(key)}&callback=traceAtlasTencentReady`;
    document.head.appendChild(script);
  }).catch((error) => {
    sdkPromise = undefined;
    throw error;
  });
  return sdkPromise;
}
export function createTencent(
  container: HTMLElement,
  sdk: SDK,
  camera: Camera | undefined,
  onLoad: () => void,
): Engine {
  const point = (lng: number, lat: number) => {
    const p = toGcj(lng, lat);
    return new sdk.LatLng(p[1], p[0]);
  };
  const map = new sdk.Map(container, {
    center: point(...(camera?.center ?? [105, 28])),
    zoom: (camera?.zoom ?? 2.5) + 1,
    minZoom: 3,
    maxZoom: 20,
    viewMode: '2D',
    pitch: 0,
    rotation: 0,
    pitchable: false,
    rotatable: false,
    showControl: false,
  });
  const canvas = document.createElement('canvas');
  canvas.className = 'tencent-fog';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const source = document.createElement('canvas'),
    sourceCtx = source.getContext('2d')!;
  let frame: View | undefined;
  let removed = false;
  const listeners = { move: new Set<() => void>(), resize: new Set<() => void>() };
  const view = (id = 0): View => {
    const width = Math.max(1, container.clientWidth),
      height = Math.max(1, container.clientHeight);
    const topLeft = map.unprojectFromContainer(new sdk.Point(0, 0));
    const p = mercator(topLeft.getLng(), topLeft.getLat());
    // Derive actual CSS-pixel scale from SDK projection; don't depend on tile-size conventions.
    const c = map.getCenter(),
      a = map.projectToContainer(c),
      b = map.projectToContainer(new sdk.LatLng(c.getLat(), c.getLng() + 0.001));
    const world = (Math.abs(b.x - a.x) * 360) / 0.001;
    return {
      left: p[0] * world,
      top: p[1] * world,
      world,
      width,
      height,
      zoom: Math.log2(world / 512),
      pixelRatio: Math.min(2, devicePixelRatio || 1),
      id,
      gcj: true,
    };
  };
  const draw = () => {
    if (removed) return;
    const v = view(),
      ratio = v.pixelRatio!;
    const width = Math.round(v.width * ratio),
      height = Math.round(v.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, v.width, v.height);
    if (frame && (frame.zoom > 7 || v.zoom <= 7)) {
      const t = maskTransform(frame, v);
      // Copy the alpha mask while retaining opaque fog outside the previous viewport.
      ctx.globalCompositeOperation = 'copy';
      const x = (-t.offset[0] * v.width) / t.scale[0],
        y = (-t.offset[1] * v.height) / t.scale[1];
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, v.width / t.scale[0], v.height / t.scale[1]);
      ctx.clip();
      ctx.drawImage(source, x, y, v.width / t.scale[0], v.height / t.scale[1]);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, v.width, v.height);
    }
    canvas.style.opacity = String(layer.opacity);
  };
  const layer = {
    opacity: 0.78,
    frame(bitmap: ImageBitmap, v: View) {
      source.width = bitmap.width;
      source.height = bitmap.height;
      sourceCtx.drawImage(bitmap, 0, 0);
      bitmap.close();
      frame = v;
      draw();
    },
    invalidate() {
      frame = undefined;
      draw();
    },
  };
  const move = () => {
    draw();
    listeners.move.forEach((cb) => cb());
  };
  const resize = () => {
    draw();
    listeners.resize.forEach((cb) => cb());
  };
  map.on('tilesloaded', onLoad);
  map.on('bounds_changed', move);
  map.on('resize', resize);
  draw();
  return {
    layer,
    view,
    camera: () => {
      const c = map.getCenter();
      return { center: fromGcj(c.getLng(), c.getLat()), zoom: view().zoom };
    },
    on: (event, cb) => {
      listeners[event].add(cb);
    },
    off: (event, cb) => {
      listeners[event].delete(cb);
    },
    fire: move,
    triggerRepaint: draw,
    zoomIn: () => map.setZoom(Math.min(20, map.getZoom() + 1)),
    zoomOut: () => map.setZoom(Math.max(3, map.getZoom() - 1)),
    fitBounds: (b, options) =>
      map.fitBounds(new sdk.LatLngBounds(point(...b[0]), point(...b[1])), {
        padding: options.padding,
        maxZoom: options.maxZoom + 1,
      }),
    remove() {
      removed = true;
      map.off('tilesloaded', onLoad);
      map.off('bounds_changed', move);
      map.off('resize', resize);
      canvas.remove();
      map.destroy();
    },
  };
}
