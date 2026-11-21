import * as maplibregl from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FogLayer } from './fog-layer';
import { cameraView } from './camera';
import type { Camera, Engine } from './engine';
maplibregl.setWorkerUrl(mapWorkerUrl);
export function createOpenFreeMap(
  container: HTMLElement,
  camera: Camera | undefined,
  ready: (engine: Engine) => void,
  failure: () => void,
): Engine {
  const map = new maplibregl.Map({
    container,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: camera?.center ?? [105, 28],
    zoom: camera?.zoom ?? 2.5,
    minZoom: 1,
    maxZoom: 19,
    maxPitch: 0,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: { compact: true },
  });
  const layer = new FogLayer();
  const engine: Engine = {
    layer,
    view: (id) => cameraView(map, id),
    camera: () => ({ center: [map.getCenter().lng, map.getCenter().lat], zoom: map.getZoom() }),
    on: (e, cb) => {
      map.on(e, cb);
    },
    off: (e, cb) => {
      map.off(e, cb);
    },
    fire: (e) => {
      map.fire(e);
    },
    triggerRepaint: () => map.triggerRepaint(),
    zoomIn: () => {
      map.zoomIn();
    },
    zoomOut: () => {
      map.zoomOut();
    },
    fitBounds: (b, o) => {
      map.fitBounds(b, o);
    },
    remove: () => map.remove(),
  };
  map.touchZoomRotate.disableRotation();
  map.on('load', () => {
    map.setProjection({ type: 'mercator' });
    map.addLayer(layer);
    ready(engine);
  });
  map.on('error', failure);
  map.on('webglcontextlost', () => {
    layer.invalidate();
    failure();
  });
  map.on('webglcontextrestored', () => {
    layer.onAdd(map, map.getCanvas().getContext('webgl2')!);
    map.fire('move');
  });
  return engine;
}
