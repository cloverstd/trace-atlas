import { FileClock } from 'lucide-react';
import { ACTIVE_STATUSES, type SyncRun } from '../../../shared/types';
import { cn, dateTime } from '../../lib/utils';
import { SYNC_STATUS_LABELS } from './types';

export function StatusBadge({ status }: { status: string }) {
  const [badgeColor, dotColor] =
    status === 'success'
      ? ['border-[#c7d4fe] bg-[#eef2ff] text-[#24429e]', 'bg-[#2c4ec7]']
      : status === 'failed'
        ? ['border-[#f7c8c8] bg-[#fef1f1] text-[#a62626]', 'bg-[#d63636]']
        : ACTIVE_STATUSES.includes(status)
          ? ['border-[#f5d69f] bg-[#fff7e8] text-[#9a5808]', 'animate-pulse bg-[#d98218]']
          : ['border-border bg-muted text-[var(--ink-muted)]', 'bg-current'];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        badgeColor,
      )}
    >
      <span className={cn('size-1.5 rounded-full', dotColor)} aria-hidden="true" />
      {SYNC_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function SyncRunsTable({ runs }: { runs: SyncRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center border-t border-border/70 px-6 py-14 text-center">
        <div className="mb-3.5 grid size-12 place-items-center rounded-2xl bg-muted text-[var(--ink-muted)] ring-1 ring-border">
          <FileClock size={22} strokeWidth={1.6} aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-foreground">还没有同步记录</p>
        <span className="mt-1 text-xs text-[var(--ink-muted)]">配置数据源后，开始第一次同步。</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border-t border-border/80">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-[#f4f3ee] text-xs font-semibold text-[var(--ink-muted)]">
          <tr>
            <th scope="col" className="px-6 py-3.5 whitespace-nowrap">
              开始时间
            </th>
            <th scope="col" className="px-6 py-3.5 whitespace-nowrap">
              状态
            </th>
            <th scope="col" className="px-6 py-3.5 whitespace-nowrap">
              解析进度
            </th>
            <th scope="col" className="px-6 py-3.5 whitespace-nowrap">
              结果
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/75">
          {runs.map((run) => (
            <tr key={run.id} className="transition-colors hover:bg-[#faf9f5]">
              <td className="px-6 py-4 align-middle whitespace-nowrap text-[var(--ink-secondary)] tabular-nums">
                {dateTime(run.started_at)}
              </td>
              <td className="px-6 py-4 align-middle whitespace-nowrap">
                <StatusBadge status={run.status} />
              </td>
              <td className="px-6 py-4 align-middle whitespace-nowrap font-medium text-foreground tabular-nums">
                {run.processed} / {run.discovered}
              </td>
              <td className="px-6 py-4 align-middle max-w-[360px] text-xs leading-relaxed text-[var(--ink-secondary)]">
                {run.error ??
                  (run.status === 'success'
                    ? '同步完成'
                    : run.status === 'queued'
                      ? '等待下一次定时任务'
                      : run.status === 'cancelled'
                        ? '任务已停止'
                        : '正在处理')}
                {run.error && ACTIVE_STATUSES.includes(run.status) && (
                  <small className="mt-1 block text-xs text-[var(--ink-muted)] tabular-nums">
                    下次重试：{dateTime(run.next_attempt_at)}
                  </small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
