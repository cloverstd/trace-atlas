import type { FormEvent } from 'react';
import { Cloud, Play, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { AdminConfig } from './types';

export interface SettingsTabProps {
  config: AdminConfig;
  busy: boolean;
  onChange: (next: AdminConfig) => void;
  onTest: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function SettingsTab({ config, busy, onChange, onTest, onSubmit }: SettingsTabProps) {
  const labelClass = 'block text-sm font-medium text-[var(--ink-secondary)]';
  const helpClass = 'mt-2 block text-xs leading-relaxed font-normal text-[var(--ink-muted)]';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_310px] items-start gap-6">
      <Card>
        <CardHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-[#161922] text-[#e59a3c]">
            <Cloud size={20} aria-hidden="true" />
          </div>
          <CardTitle>坚果云 WebDAV</CardTitle>
          <CardDescription>使用坚果云「第三方应用管理」生成的应用密码。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={onSubmit}>
            <label htmlFor="endpoint" className={labelClass}>
              服务地址
              <Input id="endpoint" className="mt-2" value={config.endpoint} readOnly />
            </label>

            <div className="grid grid-cols-2 gap-5">
              <label htmlFor="username" className={labelClass}>
                坚果云账号
                <Input
                  id="username"
                  className="mt-2"
                  autoComplete="username"
                  value={config.username}
                  onChange={(e) => onChange({ ...config, username: e.target.value })}
                  required
                  placeholder="你的坚果云账号"
                />
              </label>
              <label htmlFor="password" className={labelClass}>
                <span className="flex items-center justify-between gap-2">
                  应用密码
                  {config.passwordConfigured && (
                    <small className="rounded-full border border-[#c7d4fe] bg-[#eef2ff] px-2 text-[11px] leading-5 text-[#24429e]">
                      已配置
                    </small>
                  )}
                </span>
                <Input
                  id="password"
                  className="mt-2"
                  type="password"
                  autoComplete="new-password"
                  value={config.password ?? ''}
                  onChange={(e) => onChange({ ...config, password: e.target.value })}
                  required={!config.passwordConfigured}
                  placeholder={config.passwordConfigured ? '留空保留已有密码' : '输入应用专用密码'}
                />
              </label>
            </div>

            <label htmlFor="path" className={labelClass}>
              Sync 目录路径
              <Input
                id="path"
                className="mt-2"
                value={config.path}
                onChange={(e) => onChange({ ...config, path: e.target.value })}
                required
                placeholder="例如 /Fog of World/Sync"
              />
              <span className={helpClass}>填写坚果云中的实际 Sync 路径。程序只读取该目录。</span>
            </label>

            <div className="h-px bg-border" />
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/45 px-4 py-3.5">
              <div>
                <strong className="text-sm font-semibold text-foreground">自动同步</strong>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-muted)]">
                  定期检查新增和修改的数据文件。
                </p>
              </div>
              <input
                aria-label="开启自动同步"
                className="atlas-switch"
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => onChange({ ...config, enabled: e.target.checked })}
              />
            </div>

            <label htmlFor="interval" className={labelClass}>
              检查间隔（分钟）
              <Input
                id="interval"
                className="mt-2"
                type="number"
                min={30}
                max={10080}
                required
                value={config.intervalMinutes}
                onChange={(e) => onChange({ ...config, intervalMinutes: Number(e.target.value) })}
              />
              <span className={helpClass}>默认 60 分钟；同步期间不会重复启动任务。</span>
            </label>

            <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
              <p className="text-xs leading-relaxed text-[var(--ink-muted)]">
                保存配置会停止当前同步任务，后续任务使用新配置。
              </p>
              <div className="flex shrink-0 items-center gap-2.5">
                <Button type="button" variant="outline" disabled={busy} onClick={onTest}>
                  <Play aria-hidden="true" />
                  测试连接
                </Button>
                <Button type="submit" disabled={busy}>
                  <Save aria-hidden="true" />
                  保存设置
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-[#faf9f6]">
        <CardHeader className="pb-4">
          <CardTitle>连接说明</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            <li className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-[#e59a3c]"
              />
              <div>
                <strong className="text-sm font-semibold text-foreground">只读访问</strong>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
                  仅扫描指定 Sync 目录，不修改或删除云端文件。
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-[#e59a3c]"
              />
              <div>
                <strong className="text-sm font-semibold text-foreground">加密存储</strong>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
                  应用密码使用 AES-GCM 加密保存，保存后不再明文回显。
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-[#e59a3c]"
              />
              <div>
                <strong className="text-sm font-semibold text-foreground">测试优先</strong>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
                  建议先点击「测试连接」验证目录与凭证，再保存生效。
                </p>
              </div>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
