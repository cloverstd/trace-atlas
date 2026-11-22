import { RefreshCw } from 'lucide-react';
import type { SyncRun } from '../../../shared/types';
import { Button } from '../ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { SyncRunsTable } from './sync-runs-table';

export interface HistoryTabProps {
  runs: SyncRun[];
  busy: boolean;
  configured: boolean;
  hasActive: boolean;
  onSync: () => void;
}

export function HistoryTab({ runs, busy, configured, hasActive, onSync }: HistoryTabProps) {
  return (
    <Card className="w-full overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <CardTitle>同步记录</CardTitle>
            {runs.length > 0 && (
              <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-[var(--ink-muted)] tabular-nums">
                {runs.length} 条记录
              </span>
            )}
          </div>
          <CardDescription>显示最近 50 次任务，记录保留 30 天。</CardDescription>
        </div>
        <Button
          className="shrink-0"
          variant="outline"
          disabled={busy || !configured || hasActive}
          onClick={onSync}
        >
          <RefreshCw className={hasActive ? 'spin' : ''} aria-hidden="true" />
          立即同步
        </Button>
      </CardHeader>
      <SyncRunsTable runs={runs} />
    </Card>
  );
}
