import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { Layers, Minus, Plus, Scan, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MapChoice, Provider } from './engine';

const pathWidthLabels = ['纤细', '标准', '较粗', '粗', '最粗'];
const valuePillClass =
  'rounded-full border border-[#e59a3c]/25 bg-[#e59a3c]/15 px-2 py-0.5 text-xs font-medium text-[#f5c276] tabular-nums';
const zoomButtonClass =
  'size-11 rounded-none text-[#f5f4f0] hover:bg-white/10 hover:text-white focus-visible:ring-[#e59a3c] focus-visible:ring-offset-0 focus-visible:ring-inset';

type MapControlsProps = {
  canFit: boolean;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  showLayers: boolean;
  onLayersChange: (open: boolean) => void;
  choice: MapChoice;
  provider: Provider;
  tencentAvailable: boolean;
  onChoose: (choice: MapChoice) => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
  pathWidth: number;
  onPathWidthChange: (width: number) => void;
};

export function MapControls({
  canFit,
  onFit,
  onZoomIn,
  onZoomOut,
  showLayers,
  onLayersChange,
  choice,
  provider,
  tencentAvailable,
  onChoose,
  opacity,
  onOpacityChange,
  pathWidth,
  onPathWidthChange,
}: MapControlsProps) {
  const layersButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeLayers = useCallback(() => {
    onLayersChange(false);
    layersButton.current?.focus();
  }, [onLayersChange]);

  useEffect(() => {
    if (!showLayers) return;

    closeButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) closeLayers();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLayers, closeLayers]);

  const opacityPercent = `${Math.round(opacity * 100)}%`;
  const opacityProgress = ((opacity - 0.35) / (0.95 - 0.35)) * 100;
  const pathWidthLabel = pathWidthLabels[pathWidth - 1];
  const pathWidthProgress = ((pathWidth - 1) / 4) * 100;

  return (
    <div className="pointer-events-none absolute top-[max(14px,env(safe-area-inset-top))] right-3.5 md:top-6 md:right-6">
      <div className="pointer-events-auto relative z-20 flex flex-col items-end gap-2">
        <div className="atlas-hud-glass flex flex-col items-center overflow-hidden rounded-2xl">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={zoomButtonClass}
            aria-label="放大地图"
            onClick={onZoomIn}
          >
            <Plus />
          </Button>
          <span aria-hidden="true" className="h-px w-5 bg-white/14" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={zoomButtonClass}
            aria-label="缩小地图"
            onClick={onZoomOut}
          >
            <Minus />
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="atlas-hud-glass size-11 rounded-2xl text-[#f5f4f0] hover:bg-[#242836]/92 hover:text-white focus-visible:ring-[#e59a3c] focus-visible:ring-offset-0 disabled:text-white/28 disabled:opacity-100"
          aria-label="回到探索范围"
          disabled={!canFit}
          onClick={onFit}
        >
          <Scan />
        </Button>
        <Button
          ref={layersButton}
          type="button"
          variant="ghost"
          size="icon"
          className="atlas-hud-glass size-11 rounded-2xl text-[#f5f4f0] hover:bg-[#242836]/92 hover:text-white focus-visible:ring-[#e59a3c] focus-visible:ring-offset-0 aria-expanded:border-[#f0b45e]/60 aria-expanded:bg-[#e59a3c] aria-expanded:text-[#12141a] aria-expanded:hover:bg-[#ecaa4f] aria-expanded:hover:text-[#12141a]"
          aria-label="地图显示设置"
          aria-expanded={showLayers}
          aria-controls={showLayers ? 'map-display-settings' : undefined}
          onClick={() => onLayersChange(!showLayers)}
        >
          <Layers />
        </Button>
      </div>
      {showLayers && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-auto fixed inset-0 z-25 bg-black/45 backdrop-blur-[2px] md:hidden"
            onClick={closeLayers}
          />
          <section
            id="map-display-settings"
            aria-labelledby="map-display-title"
            className="atlas-hud-glass-strong pointer-events-auto fixed inset-x-3 bottom-[max(14px,env(safe-area-inset-bottom))] z-30 max-h-[calc(100dvh-max(14px,env(safe-area-inset-bottom))-16px)] overflow-y-auto rounded-3xl p-5 text-[#f5f4f0] md:absolute md:inset-x-auto md:top-0 md:right-[calc(100%+12px)] md:bottom-auto md:max-h-[calc(100dvh-48px)] md:w-[276px] md:rounded-2xl md:p-4"
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-3.5 h-1 w-10 rounded-full bg-white/20 md:hidden"
            />
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2
                id="map-display-title"
                className="flex items-center gap-2.5 text-base font-semibold text-[#f8f8f6]"
              >
                <span aria-hidden="true" className="size-2 rounded-full bg-[#e59a3c]" />
                地图显示
              </h2>
              <Button
                ref={closeButton}
                type="button"
                variant="ghost"
                size="icon"
                className="relative size-10 rounded-full border border-white/14 bg-white/5 text-[#d4d7e0] after:absolute after:-inset-[3px] hover:bg-white/12 hover:text-white focus-visible:ring-[#e59a3c] focus-visible:ring-offset-0 md:size-8.5 md:after:hidden"
                aria-label="关闭显示设置"
                onClick={closeLayers}
              >
                <X />
              </Button>
            </div>
            <div className="grid gap-3.5">
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <label htmlFor="map-provider" className="text-sm font-medium text-[#d4d7e0]">
                    底图
                  </label>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#e59a3c]/30 bg-[#e59a3c]/14 px-2.5 py-0.5 text-xs font-medium text-[#f5c276]"
                    aria-live="polite"
                  >
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-[#e59a3c]" />
                    当前：{provider === 'tencent' ? '腾讯地图' : 'OpenFreeMap'}
                  </span>
                </div>
                <select
                  id="map-provider"
                  className="atlas-select min-h-11 text-sm md:min-h-10"
                  value={choice}
                  onChange={(event) => onChoose(event.target.value as MapChoice)}
                >
                  <option value="auto">自动选择</option>
                  <option value="openfreemap">OpenFreeMap</option>
                  <option value="tencent" disabled={!tencentAvailable}>
                    腾讯地图{!tencentAvailable ? '（暂不可用）' : ''}
                  </option>
                </select>
              </div>
              <div className="border-t border-white/10 pt-3.5">
                <label
                  htmlFor="fog-opacity"
                  className="flex items-center justify-between gap-2 text-sm font-medium text-[#d4d7e0]"
                >
                  迷雾浓度{' '}
                  <span aria-hidden="true" className={valuePillClass}>
                    {opacityPercent}
                  </span>
                </label>
                <input
                  id="fog-opacity"
                  className="atlas-slider min-h-11 md:min-h-0"
                  type="range"
                  min=".35"
                  max=".95"
                  step=".01"
                  value={opacity}
                  aria-valuetext={opacityPercent}
                  style={{ '--slider-progress': `${opacityProgress}%` } as CSSProperties}
                  onChange={(event) => onOpacityChange(Number(event.target.value))}
                />
              </div>
              <div>
                <label
                  htmlFor="path-width"
                  className="flex items-center justify-between gap-2 text-sm font-medium text-[#d4d7e0]"
                >
                  路径粗细{' '}
                  <span aria-hidden="true" className={valuePillClass}>
                    {pathWidthLabel}
                  </span>
                </label>
                <input
                  id="path-width"
                  className="atlas-slider min-h-11 md:min-h-0"
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={pathWidth}
                  aria-valuetext={pathWidthLabel}
                  style={{ '--slider-progress': `${pathWidthProgress}%` } as CSSProperties}
                  onChange={(event) => onPathWidthChange(Number(event.target.value))}
                />
                <div aria-hidden="true" className="flex justify-between text-[10px] text-[#8f96a6]">
                  {pathWidthLabels.map((label) => (
                    <span
                      key={label}
                      className={cn(
                        'w-6 text-center before:mx-auto before:mb-1 before:block before:h-1 before:w-px before:bg-white/16',
                        label === pathWidthLabel && 'font-medium text-[#f5c276]',
                      )}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
