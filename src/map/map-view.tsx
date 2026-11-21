import { useEffect, useRef, useState } from 'react';
import { createOpenFreeMap } from './openfreemap';
import { createTencent, loadTencent } from './tencent';
import type { Engine, MaskLayer, Camera, Provider, MapChoice } from './engine';
import type { MapManifest, FogTile, TileOverview } from '../../shared/types';
import type { View, RenderMessage } from './types';
import { tileVisible } from './geometry';
import { Button } from '@/components/ui/button';
import { Plus, Minus, Scan, Layers, RefreshCw } from 'lucide-react';
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
  const [provider, setProvider] = useState<Provider>(
    choice === 'tencent' ? 'tencent' : 'openfreemap',
  );
  const [tencentKey, setTencentKey] = useState<string | null>(null);
  const [mapStatus, setMapStatus] = useState('正在加载地图');
  const [attempt, setAttempt] = useState(0);
  const camera = useRef<Camera | undefined>(undefined);
  const choose = (next: MapChoice) => {
    setChoice(next);
    setProvider(next === 'tencent' ? 'tencent' : 'openfreemap');
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
  const fitted = useRef(false);
  errorRef.current = onError;
  useEffect(() => {
    if (!container.current || tencentKey === null) return;
    let disposed = false,
      engineReady = false,
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
      clearTimeout(timer);
      mapRef.current = loaded;
      layerRef.current = loaded.layer;
      fitted.current = !!camera.current;
      setMapStatus('');
      setReady(true);
    };
    let failed = false;
    const failure = () => {
      if (disposed || failed) return;
      failed = true;
      clearTimeout(timer);
      if (choice === 'auto' && provider === 'openfreemap' && tencentKey) {
        setMapStatus('正在切换到腾讯地图');
        setProvider('tencent');
      } else {
        setMapStatus('地图加载失败，可重试或切换地图');
      }
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
    } else if (tencentKey) {
      timer = setTimeout(failure, 16000);
      void loadTencent(tencentKey)
        .then((sdk) => {
          if (disposed) return;
          engine = createTencent(host, sdk, camera.current, () => {
            if (engine) success(engine);
          });
        })
        .catch(failure);
    } else {
      setProvider('openfreemap');
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
  }, [provider, choice, tencentKey, attempt]);
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
    if (manifest?.bounds && !fitted.current) {
      fitted.current = true;
      map.fitBounds(
        [
          [manifest.bounds[0], manifest.bounds[1]],
          [manifest.bounds[2], manifest.bounds[3]],
        ],
        { padding: { top: 130, bottom: 140, left: 55, right: 55 }, maxZoom: 13, duration: 0 },
      );
    }
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
  }, [ready, manifest?.version, provider, choice, tencentKey, attempt]);
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
  return (
    <>
      <div ref={container} className="map-canvas" aria-label="世界迷雾探索地图" />
      <div className="map-controls">
        <div className="control-stack">
          <Button
            variant="ghost"
            size="icon"
            aria-label="放大地图"
            onClick={() => mapRef.current?.zoomIn()}
          >
            <Plus />
          </Button>
          <span />
          <Button
            variant="ghost"
            size="icon"
            aria-label="缩小地图"
            onClick={() => mapRef.current?.zoomOut()}
          >
            <Minus />
          </Button>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="回到探索范围"
          disabled={!manifest?.bounds}
          onClick={fit}
        >
          <Scan />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="地图显示设置"
          aria-expanded={showLayers}
          onClick={() => setShowLayers(!showLayers)}
        >
          <Layers />
        </Button>
        {showLayers && (
          <div className="layer-panel">
            <label htmlFor="map-provider">底图</label>
            <select
              id="map-provider"
              value={choice}
              onChange={(e) => choose(e.target.value as MapChoice)}
            >
              <option value="auto">自动选择</option>
              <option value="openfreemap">OpenFreeMap</option>
              <option value="tencent" disabled={!tencentKey}>
                腾讯地图{!tencentKey ? '（暂不可用）' : ''}
              </option>
            </select>
            <small>当前：{provider === 'tencent' ? '腾讯地图' : 'OpenFreeMap'}</small>
            <label htmlFor="fog-opacity">
              迷雾浓度 <span>{Math.round(opacity * 100)}%</span>
            </label>
            <input
              id="fog-opacity"
              type="range"
              min=".35"
              max=".95"
              step=".01"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
            <label htmlFor="path-width">
              路径粗细 <span>{['纤细', '标准', '较粗', '粗', '最粗'][pathWidth - 1]}</span>
            </label>
            <input
              id="path-width"
              type="range"
              min="1"
              max="5"
              step="1"
              value={pathWidth}
              aria-valuetext={['纤细', '标准', '较粗', '粗', '最粗'][pathWidth - 1]}
              onChange={(e) => setPathWidth(Number(e.target.value))}
            />
          </div>
        )}
      </div>
      {mapStatus && (
        <div className="map-connection" role="status">
          <span>{mapStatus}</span>
          {mapStatus.includes('失败') && (
            <Button variant="ghost" size="sm" onClick={() => choose(choice)}>
              重试
            </Button>
          )}
        </div>
      )}
      {loading && (
        <div className="map-loading" role="status">
          <RefreshCw className="spin" size={13} />
          正在加载足迹
        </div>
      )}
    </>
  );
}
