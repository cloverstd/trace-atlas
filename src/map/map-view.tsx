import { useEffect, useRef, useState } from 'react';
import { createOpenFreeMap } from './openfreemap';
import { createTencent, loadTencent } from './tencent';
import type { Engine, MaskLayer, Camera, Provider, MapChoice } from './engine';
import type { MapManifest, FogTile, TileOverview } from '../../shared/types';
import type { View, RenderMessage } from './types';
import { tileVisible } from './geometry';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { MapControls } from './map-controls';

const WUHAN_CAMERA: Camera = { center: [114.3, 30.59], zoom: 10 };

export function MapView({
  manifest,
  onError,
}: {
  manifest: MapManifest | null;
  onError: (s: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    mapRef = useRef<Engine | null>(null),
    layerRef = useRef<MaskLayer | null>(null);
  const [choice, setChoice] = useState<MapChoice>(() => {
    try {
      const saved = localStorage.getItem('trace-atlas-map');
      return saved === 'tencent' || saved === 'openfreemap' ? saved : 'auto';
    } catch {
      return 'auto';
    }
  });
  const [tencentKey, setTencentKey] = useState<string | null>(null);
  const [openMapFailed, setOpenMapFailed] = useState(false);
  const provider: Provider =
    choice === 'tencent' || (choice === 'auto' && openMapFailed && tencentKey)
      ? 'tencent'
      : 'openfreemap';
  // Resolving the fallback key must not recreate a running OpenFreeMap instance.
  const providerKey = provider === 'tencent' ? tencentKey : null;
  const [mapStatus, setMapStatus] = useState('正在加载地图');
  const [attempt, setAttempt] = useState(0);
  const camera = useRef(WUHAN_CAMERA);
  const choose = (next: MapChoice) => {
    setChoice(next);
    setOpenMapFailed(false);
    setAttempt((a) => a + 1);
    try {
      localStorage.setItem('trace-atlas-map', next);
    } catch {
      /* Optional preference. */
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    let active = true;
    void fetch('/api/public/map-config', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json() as Promise<{ tencentKey: string }>;
      })
      .then((config) => {
        if (active) setTencentKey(config.tencentKey || '');
      })
      .catch(() => {
        if (active) setTencentKey('');
      })
      .finally(() => clearTimeout(timer));
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt]);
  const [ready, setReady] = useState(false),
    [opacity, setOpacity] = useState(0.78),
    [pathWidth, setPathWidth] = useState(() => {
      try {
        const value = Number(localStorage.getItem('trace-atlas-path-width'));
        return value >= 1 && value <= 5 ? value : 2;
      } catch {
        return 2;
      }
    }),
    [showLayers, setShowLayers] = useState(false),
    [loading, setLoading] = useState(false);
  const errorRef = useRef(onError);
  const pathWidthRef = useRef(pathWidth);
  pathWidthRef.current = pathWidth;
  useEffect(() => {
    try {
      localStorage.setItem('trace-atlas-path-width', String(pathWidth));
    } catch {
      /* Optional local preference. */
    }
    mapRef.current?.fire('move');
  }, [pathWidth]);
  errorRef.current = onError;
  useEffect(() => {
    if (!container.current || (provider === 'tencent' && providerKey === null)) return;
    let disposed = false,
      engineReady = false,
      failed = false,
      engine: Engine | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setReady(false);
    setMapStatus('正在加载地图');
    const host = document.createElement('div');
    host.className = 'map-engine';
    container.current.appendChild(host);
    const success = (loaded: Engine) => {
      if (disposed || engineReady) return;
      engineReady = true;
      failed = false;
      clearTimeout(timer);
      if (provider === 'openfreemap') setOpenMapFailed(false);
      mapRef.current = loaded;
      layerRef.current = loaded.layer;
      setMapStatus('');
      setReady(true);
    };
    const failure = () => {
      if (disposed || failed) return;
      failed = true;
      clearTimeout(timer);
      if (choice === 'auto' && provider === 'openfreemap') setOpenMapFailed(true);
      setMapStatus('地图加载失败，可重试或切换地图');
    };
    if (provider === 'openfreemap') {
      // Readiness checks the actual style and visible map resources, not a server-side ping.
      timer = setTimeout(failure, 6000);
      try {
        engine = createOpenFreeMap(host, camera.current, success, failure);
        mapRef.current = engine;
      } catch {
        failure();
      }
    } else if (providerKey) {
      timer = setTimeout(failure, 16000);
      void loadTencent(providerKey)
        .then((sdk) => {
          if (disposed) return;
          engine = createTencent(host, sdk, camera.current, () => {
            if (engine) success(engine);
          });
        })
        .catch(failure);
    } else {
      setChoice('auto');
    }
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (engine) {
        try {
          if (engineReady) camera.current = engine.camera();
        } catch {
          /* Initialization may have failed. */
        }
        engine.remove();
      }
      host.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [provider, choice, providerKey, attempt]);
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.opacity = opacity;
      mapRef.current?.triggerRepaint();
    }
  }, [opacity, ready]);
  useEffect(() => {
    const map = mapRef.current,
      layer = layerRef.current;
    if (!ready || !map || !layer) return;
    if (typeof OffscreenCanvas === 'undefined') {
      errorRef.current('当前浏览器不支持迷雾渲染，请更新浏览器。');
      return;
    }
    const worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
    const controller = new AbortController();
    let disposed = false,
      frameId = 0,
      raf = 0,
      inFlight = 0,
      overviewReady = false,
      workerBusy = false;
    let queuedView: View | undefined;
    const overview = new Map<number, TileOverview>(),
      loaded = new Set<number>(),
      pending = new Set<number>(),
      failed = new Map<number, number>();
    const send = (message: RenderMessage) => worker.postMessage(message);
    const renderView = (next: View) => {
      if (workerBusy) queuedView = next;
      else {
        workerBusy = true;
        send({ type: 'render', view: next });
      }
    };
    const view = (): View => ({ ...map.view(frameId), pathWidth: pathWidthRef.current });
    const fetchJson = async <T,>(url: string): Promise<T> => {
      const r = await fetch(url, { signal: controller.signal });
      if (!r.ok) throw new Error('地图数据加载失败，请稍后重试或刷新页面。');
      return r.json() as Promise<T>;
    };
    const loadDetails = () => {
      if (!manifest || !overviewReady || disposed) return;
      const v = view();
      if (v.zoom <= 7) {
        setLoading(false);
        return;
      }
      const candidates = [...overview.values()].filter((t) => tileVisible(t.x, t.y, v));
      for (const tile of candidates) {
        if (inFlight >= 2) break;
        if (loaded.has(tile.id) || pending.has(tile.id) || (failed.get(tile.id) ?? 0) > Date.now())
          continue;
        pending.add(tile.id);
        inFlight++;
        void fetchJson<FogTile>(`/api/public/data/${manifest.version}/tile/${tile.id}?encoding=2`)
          .then((data) => {
            if (disposed) return;
            loaded.add(tile.id);
            send({ type: 'tile', tile: data });
            draw();
          })
          .catch(() => {
            if (!disposed) {
              failed.set(tile.id, Date.now() + 15000);
              errorRef.current('部分足迹数据加载失败，未加载区域保留迷雾。');
            }
          })
          .finally(() => {
            pending.delete(tile.id);
            inFlight--;
            if (!disposed) {
              loadDetails();
            }
          });
      }
      setLoading(candidates.some((t) => !loaded.has(t.id)) && inFlight > 0);
    };
    const draw = () => {
      if (disposed) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        frameId++;
        renderView(view());
        loadDetails();
      });
    };
    worker.onmessage = (e) => {
      if (e.data.type === 'frame') {
        if (disposed) {
          e.data.bitmap.close();
          return;
        }
        layer.frame(e.data.bitmap, e.data.view);
        workerBusy = false;
        if (queuedView) {
          const next = queuedView;
          queuedView = undefined;
          renderView(next);
        }
      } else if (e.data.type === 'evicted') for (const id of e.data.ids) loaded.delete(id);
      else if (e.data.type === 'error') errorRef.current('迷雾渲染失败，请刷新页面。');
    };
    worker.onerror = () => errorRef.current('迷雾渲染失败，请刷新页面。');
    map.on('move', draw);
    map.on('resize', draw);
    void (async () => {
      if (manifest) {
        setLoading(true);
        for (let page = 0; page < manifest.overviewPages; page++) {
          try {
            const tiles = await fetchJson<TileOverview[]>(
              `/api/public/data/${manifest.version}/overview/${page}?encoding=2`,
            );
            if (disposed) return;
            for (const tile of tiles) overview.set(tile.id, tile);
            send({ type: 'overview', tiles });
            draw();
          } catch {
            if (!disposed) errorRef.current('探索概览加载失败，请刷新页面重试。');
          }
        }
      }
      overviewReady = true;
      if (!disposed) {
        setLoading(false);
        draw();
      }
    })();
    const retryTimer = setInterval(loadDetails, 15000);
    draw();
    return () => {
      disposed = true;
      controller.abort();
      worker.terminate();
      clearInterval(retryTimer);
      cancelAnimationFrame(raf);
      map.off('move', draw);
      map.off('resize', draw);
      layer.invalidate();
    };
  }, [ready, manifest?.version, provider, choice, providerKey, attempt]);
  const fit = () => {
    const b = manifest?.bounds;
    if (b)
      mapRef.current?.fitBounds(
        [
          [b[0], b[1]],
          [b[2], b[3]],
        ],
        { padding: { top: 130, bottom: 140, left: 55, right: 55 }, maxZoom: 13 },
      );
  };
  const status = openMapFailed && tencentKey === null ? '正在连接备用地图' : mapStatus;
  return (
    <>
      <div ref={container} className="map-canvas" aria-label="世界迷雾探索地图" />
      <MapControls
        canFit={ready && !!manifest?.bounds}
        onFit={fit}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        showLayers={showLayers}
        onLayersChange={setShowLayers}
        choice={choice}
        provider={provider}
        tencentAvailable={!!tencentKey}
        onChoose={choose}
        opacity={opacity}
        onOpacityChange={setOpacity}
        pathWidth={pathWidth}
        onPathWidthChange={setPathWidth}
      />
      {status && (
        <div
          className="map-connection atlas-hud-glass-strong absolute top-[calc(max(14px,env(safe-area-inset-top))+64px)] left-1/2 z-20 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border-[#e59a3c]/35 px-3.5 py-2 text-xs font-medium text-[#faf6ef] md:top-6"
          role="status"
        >
          <span>{status}</span>
          {status.includes('失败') && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="relative h-7 min-w-11 rounded-full bg-[#e59a3c] px-2.5 text-xs font-semibold text-[#12141a] after:absolute after:-inset-y-2 after:inset-x-0 hover:bg-[#f0ad52] focus-visible:ring-[#e59a3c] focus-visible:ring-offset-0 md:after:hidden"
              onClick={() => choose(choice)}
            >
              重试
            </Button>
          )}
        </div>
      )}
      {loading && (
        <div
          className="atlas-hud-glass absolute bottom-[calc(max(36px,env(safe-area-inset-bottom)+24px)+54px)] left-3.5 z-10 flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-[#d4d7e0] md:bottom-22 md:left-6"
          role="status"
        >
          <RefreshCw aria-hidden="true" className="spin text-[#e59a3c]" size={13} />
          正在加载足迹
        </div>
      )}
    </>
  );
}
