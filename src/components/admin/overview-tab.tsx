import {
  ArrowUpRight,
  Clock3,
  Cloud,
  Database,
  Footprints,
  RefreshCw,
  ShieldCheck,
  Square,
} from 'lucide-react';
import type { MapManifest, SyncRun } from '../../../shared/types';
import { area, dateTime } from '../../lib/utils';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { StatusBadge, SyncRunsTable } from './sync-runs-table';
import { SYNC_STATUS_LABELS, type AdminConfig, type AdminTabId } from './types';

export interface OverviewTabProps {
  manifest: MapManifest | null;
  config: AdminConfig;
  configured: boolean;
  runs: SyncRun[];
  active: SyncRun | undefined;
  lastSuccess: SyncRun | undefined;
  busy: boolean;
  onNavigate: (tab: AdminTabId) => void;
  onCancelSync: () => void;
}

export function OverviewTab({
  manifest,
  config,
  configured,
  runs,
  active,
  lastSuccess,
  busy,
  onNavigate,
  onCancelSync,
}: OverviewTabProps) {
  return (
    <>
      <div className="mb-6 grid grid-cols-3 gap-5">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[var(--ink-muted)]">已探索面积</span>
              <div className="grid size-9 place-items-center rounded-xl bg-[#fdf4e6] text-[#b86e14] ring-1 ring-[#f2dcb8]">
                <Footprints size={17} aria-hidden="true" />
              </div>
            </div>
            <div className="mt-4 text-[34px] leading-none font-semibold tracking-tight text-foreground tabular-nums">
              {manifest ? area(manifest.areaM2) : '—'}
              <small className="ml-1.5 text-sm font-normal text-[var(--ink-muted)]">km²</small>
            </div>
            <p className="mt-3 text-xs text-[var(--ink-muted)]">根据探索位图估算</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[var(--ink-muted)]">已发布数据文件</span>
              <div className="grid size-9 place-items-center rounded-xl bg-[#eef2ff] text-[#2c4ec7] ring-1 ring-[#d3ddfe]">
                <Database size={17} aria-hidden="true" />
              </div>
            </div>
            <div className="mt-4 text-[34px] leading-none font-semibold tracking-tight text-foreground tabular-nums">
              {manifest?.tileCount ?? '—'}
              <small className="ml-1.5 text-sm font-normal text-[var(--ink-muted)]">个</small>
            </div>
            <p className="mt-3 text-xs text-[var(--ink-muted)]">来自世界迷雾 Sync 目录</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[var(--ink-muted)]">最近成功同步</span>
              <div className="grid size-9 place-items-center rounded-xl bg-[#efeee8] text-[#161922] ring-1 ring-[#dedcd2]">
                <Clock3 size={17} aria-hidden="true" />
              </div>
            </div>
            <div className="mt-4 flex min-h-[34px] items-center text-xl leading-snug font-semibold tracking-tight text-foreground tabular-nums">
              {dateTime(lastSuccess?.finished_at ?? manifest?.updatedAt)}
            </div>
            <p className="mt-3 text-xs text-[var(--ink-muted)]">
              {active
                ? SYNC_STATUS_LABELS[active.status]
                : config.enabled && configured
                  ? `每 ${config.intervalMinutes} 分钟检查更新`
                  : '自动同步尚未开启'}
            </p>
          </CardContent>
        </Card>
      </div>

      {!configured && (
        <div className="mb-6 flex items-center gap-5 rounded-2xl border border-[#ebd7b7] bg-gradient-to-r from-[#fcf6eb] via-[#faf7f0] to-white p-6 shadow-[var(--shadow-card)]">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#161922] text-[#e59a3c] shadow-xs">
            <Cloud size={22} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">连接数据源，点亮第一片地图</h2>
            <p className="mt-1 text-sm text-[var(--ink-secondary)]">
              准备坚果云应用密码和世界迷雾 Sync 路径，即可开始。
            </p>
          </div>
          <Button className="ml-auto shrink-0" onClick={() => onNavigate('settings')}>
            配置数据源 <ArrowUpRight aria-hidden="true" />
          </Button>
        </div>
      )}

      {active && (
        <Card className="mb-6 border-[#c7d4fe] bg-gradient-to-b from-[#f5f8ff] to-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 text-sm text-foreground">
                <RefreshCw className="spin text-[#2c4ec7]" size={16} aria-hidden="true" />
                <strong className="font-semibold">正在同步</strong>
                <StatusBadge status={active.status} />
              </div>
              <span className="text-sm font-medium text-foreground tabular-nums">
                {active.processed} / {active.discovered} 个文件
              </span>
            </div>
            <progress
              aria-label="解析进度"
              className="atlas-progress my-4"
              value={active.processed}
              max={Math.max(1, active.discovered)}
            />
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs leading-relaxed text-[var(--ink-secondary)]">
                {active.error ?? '任务分批执行，关闭页面后仍会继续。首次同步可能需要较长时间。'}
              </p>
              <Button size="sm" variant="outline" disabled={busy} onClick={onCancelSync}>
                <Square aria-hidden="true" />
                停止当前同步
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardTitle>最近同步</CardTitle>
            <CardDescription>仅完整成功的数据会发布到地图。</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('history')}>
            全部记录 <ArrowUpRight aria-hidden="true" />
          </Button>
        </CardHeader>
        <SyncRunsTable runs={runs.slice(0, 5)} />
      </Card>

      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[var(--ink-muted)]">
        <ShieldCheck size={15} className="text-[#2c4ec7]" aria-hidden="true" />
        <span>前台公开展示，数据配置与管理操作仅对你开放。</span>
      </div>
    </>
  );
}
