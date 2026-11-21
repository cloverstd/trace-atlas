import { MercatorCoordinate, type Map as MapLibreMap } from 'maplibre-gl';
import type { View } from './types';

export function cameraView(map: MapLibreMap, id = 0): View {
  const world = 512 * 2 ** map.getZoom();
  const topLeft = MercatorCoordinate.fromLngLat(map.unproject([0, 0]));
  return {
    left: topLeft.x * world,
    top: topLeft.y * world,
    world,
    width: Math.max(1, map.getCanvas().clientWidth),
    height: Math.max(1, map.getCanvas().clientHeight),
    zoom: map.getZoom(),
    pixelRatio: Math.min(2, map.getCanvas().width / Math.max(1, map.getCanvas().clientWidth)),
    id,
  };
}
