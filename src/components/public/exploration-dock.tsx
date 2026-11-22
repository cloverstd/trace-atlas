import { ChevronUp, Clock3, Footprints } from 'lucide-react';
import { area, cn, dateTime } from '@/lib/utils';
import type { MapManifest } from '../../../shared/types';

export function ExplorationDock({
  manifest,
  open,
  onToggle,
}: {
  manifest: MapManifest | null;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <footer className="pointer-events-none absolute inset-x-3.5 bottom-[max(36px,calc(env(safe-area-inset-bottom)+24px))] z-15 flex flex-col items-start md:inset-x-auto md:bottom-8 md:left-6 md:max-w-[calc(100%-3rem)]">
      <div
        id="exploration-details"
        className={cn('exploration-collapse w-full md:w-auto', open && 'is-open')}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="exploration-clip">
          <div className="atlas-hud-glass-strong pointer-events-auto mb-2.5 w-full rounded-2xl p-4 md:w-auto md:px-6 md:py-4.5">
            <div className="grid grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1fr)] items-center gap-3.5 md:flex md:items-center md:gap-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="hidden size-10 shrink-0 place-items-center rounded-xl border border-[#e59a3c]/25 bg-[#e59a3c]/14 text-[#e59a3c] sm:grid">
                  <Footprints size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <span className="text-xs font-medium text-[#9ea4b3]">
                    已探索面积
                    <span className="ml-1.5 inline-flex items-center rounded-md border border-[#e59a3c]/25 bg-[#e59a3c]/14 px-1.5 py-0.5 text-[10px] font-medium text-[#f5c276]">
                      估算
                    </span>
                  </span>
                  <strong className="mt-1 block text-2xl leading-none font-semibold tracking-tight text-[#f8f8f6] tabular-nums md:text-[26px]">
                    {manifest ? area(manifest.areaM2) : '—'}{' '}
                    <small className="text-xs font-normal text-[#9ea4b3]">km²</small>
                  </strong>
                </div>
              </div>
              <span className="h-10 w-px shrink-0 bg-white/12" aria-hidden="true" />
              <div className="flex min-w-0 items-center gap-3">
                <span className="hidden size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/6 text-[#d4d7e0] md:grid">
                  <Clock3 size={17} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <span className="text-xs font-medium text-[#9ea4b3]">数据更新时间</span>
                  <p className="mt-1 text-xs leading-snug font-medium text-[#eceef2] tabular-nums md:text-sm">
                    {manifest?.updatedAt ? dateTime(manifest.updatedAt) : '暂无足迹'}
                  </p>
                </div>
              </div>
              <div className="hidden items-center gap-5 lg:flex">
                <span className="h-10 w-px shrink-0 bg-white/12" aria-hidden="true" />
                <span className="text-xs tracking-wide text-[#9ea4b3]">让走过的路，留下光。</span>
              </div>
            </div>
            <p className="mt-3 border-t border-white/10 pt-2.5 text-xs tracking-wide text-[#9ea4b3] lg:hidden">
              让走过的路，留下光。
            </p>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="atlas-hud-glass pointer-events-auto inline-flex min-h-[42px] items-center gap-2.5 rounded-2xl px-3.5 text-sm font-medium text-[#f5f4f0] transition-colors hover:bg-[#1c202c]/95 focus-visible:outline-[#e59a3c] md:px-4"
        aria-expanded={open}
        aria-controls="exploration-details"
        onClick={onToggle}
      >
        <Footprints size={16} className="text-[#e59a3c]" aria-hidden="true" />
        探索概览
        <ChevronUp
          size={16}
          aria-hidden="true"
          className={cn('text-[#9ea4b3] transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
    </footer>
  );
}
