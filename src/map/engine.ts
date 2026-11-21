import type { View } from './types';
export type Provider = 'openfreemap' | 'tencent';
export type MapChoice = 'auto' | Provider;
export interface Camera {
  center: [number, number];
  zoom: number;
}
export interface MaskLayer {
  opacity: number;
  frame(bitmap: ImageBitmap, view: View): void;
  invalidate(): void;
}
export interface Engine {
  view(id?: number): View;
  camera(): Camera;
  on(event: 'move' | 'resize', cb: () => void): void;
  off(event: 'move' | 'resize', cb: () => void): void;
  fire(event: 'move'): void;
  triggerRepaint(): void;
  zoomIn(): void;
  zoomOut(): void;
  fitBounds(
    bounds: [[number, number], [number, number]],
    options: {
      padding: { top: number; bottom: number; left: number; right: number };
      maxZoom: number;
      duration?: number;
    },
  ): void;
  remove(): void;
  layer: MaskLayer;
}
