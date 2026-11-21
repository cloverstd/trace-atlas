import { useCallback, useEffect, useState } from 'react';
import { Compass, Footprints, Clock3, X, Globe2, ChevronUp } from 'lucide-react';
import { Brand } from './components/brand';
import { MapView } from './map/map-view';
import { api } from './lib/api';
import { area, dateTime } from './lib/utils';
import type { MapManifest } from '../shared/types';
export default function PublicPage() {
  const [manifest, setManifest] = useState<MapManifest | null>(null),
    [fetched, setFetched] = useState(false),
    [error, setError] = useState(''),
    [showStats, setShowStats] = useState(false);
  const reportError = useCallback((message: string) => setError(message), []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const data = await api<MapManifest | { empty: true }>('/api/public/manifest');
        if (!active) return;
        setManifest((old) => ('empty' in data ? null : old?.version === data.version ? old : data));
        setFetched(true);
      } catch {
        if (active) {
          setError('足迹暂时无法加载，请稍后重试。');
          setFetched(true);
        }
      }
    };
    void refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <main className="public-page">
      <MapView manifest={manifest} onError={reportError} />
      <header className="public-header">
        <Brand />
      </header>
      {fetched && !manifest && !error && (
        <div className="empty-map">
          <div className="empty-orbit">
            <Globe2 size={40} strokeWidth={1} />
            <span />
          </div>
          <h2>世界很大，足迹即将点亮</h2>
          <p>
            旅程的故事正在准备，
            <br />
            走过的地方会在地图上显现。
          </p>
        </div>
      )}
      {!fetched && (
        <div className="initial-loading" role="status">
          <Compass className="spin" />
          正在寻找足迹…
        </div>
      )}
      <footer className="exploration-dock">
        <div
          id="exploration-details"
          className={`exploration-collapse${showStats ? ' is-open' : ''}`}
          aria-hidden={!showStats}
          inert={!showStats}
        >
          <div className="exploration-clip">
            <div className="exploration-panel">
              <div className="exploration-stat">
                <span className="stat-icon">
                  <Footprints size={19} />
                </span>
                <div>
                  <span className="stat-label">
                    已探索面积 <span className="estimated">估算</span>
                  </span>
                  <strong>
                    {manifest ? area(manifest.areaM2) : '—'} <small>km²</small>
                  </strong>
                </div>
              </div>
              <span className="stat-divider" />
              <div className="exploration-update">
                <Clock3 size={16} />
                <div>
                  <span className="stat-label">数据更新时间</span>
                  <p>{manifest ? dateTime(manifest.updatedAt) : '暂无足迹'}</p>
                </div>
              </div>
              <span className="journey-note">让走过的路，留下光。</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="exploration-toggle"
          aria-expanded={showStats}
          aria-controls="exploration-details"
          onClick={() => setShowStats(!showStats)}
        >
          <Footprints size={17} />
          探索概览
          <ChevronUp size={16} className={showStats ? 'is-open' : ''} />
        </button>
      </footer>
      {error && (
        <div className="notice" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="关闭提示">
            <X size={16} />
          </button>
        </div>
      )}
    </main>
  );
}
