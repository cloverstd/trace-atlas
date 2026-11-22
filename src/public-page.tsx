import { useCallback, useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import { Brand } from '@/components/brand';
import { NoticeToast } from '@/components/notice-toast';
import { EmptyMapCard } from '@/components/public/empty-map-card';
import { ExplorationDock } from '@/components/public/exploration-dock';
import { MapView } from './map/map-view';
import { api } from './lib/api';
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
    <main className="public-page relative h-dvh min-h-[480px] overflow-hidden overscroll-none bg-[#181b23]">
      <MapView manifest={manifest} onError={reportError} />
      <header className="pointer-events-none absolute inset-x-3.5 top-[max(14px,env(safe-area-inset-top))] z-10 flex items-center justify-between md:inset-x-6 md:top-6">
        <Brand variant="floating" tone="dark" className="pointer-events-auto" />
      </header>
      {fetched && !manifest && !error && <EmptyMapCard />}
      {!fetched && (
        <div
          className="atlas-hud-glass absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium whitespace-nowrap text-[#e2e4ec]"
          role="status"
        >
          <Compass size={17} className="spin text-[#e59a3c]" aria-hidden="true" />
          正在寻找足迹…
        </div>
      )}
      <ExplorationDock
        manifest={manifest}
        open={showStats}
        onToggle={() => setShowStats((v) => !v)}
      />
      {error && <NoticeToast text={error} ok={false} theme="dark" onDismiss={() => setError('')} />}
    </main>
  );
}
