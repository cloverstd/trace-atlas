import type { FormEvent } from 'react';
import { Fingerprint, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { dateTime } from '@/lib/utils';
import type { PasskeyCredential } from './types';

export interface SecurityTabProps {
  credentials: PasskeyCredential[];
  keyName: string;
  busy: boolean;
  onKeyNameChange: (value: string) => void;
  onDelete: (credential: PasskeyCredential) => void;
  onAdd: (e: FormEvent) => void;
}

export function SecurityTab({
  credentials,
  keyName,
  busy,
  onKeyNameChange,
  onDelete,
  onAdd,
}: SecurityTabProps) {
  return (
    <div className="grid grid-cols-[1.35fr_1fr] items-start gap-6">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>已绑定的 Passkey</CardTitle>
          <CardDescription>所有凭证都属于同一个管理员。增删操作需要再次验证。</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2.5">
            {credentials.map((key) => (
              <li
                key={key.id}
                className="flex items-center gap-3 rounded-xl border border-border/80 px-3.5 py-3"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-[#161922] ring-1 ring-border">
                  <Fingerprint size={19} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <strong className="block text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
                    {key.name}
                  </strong>
                  <p className="mt-1 text-xs text-[var(--ink-muted)] tabular-nums">
                    添加于 {dateTime(key.created_at)}
                  </p>
                  <small className="mt-0.5 block text-xs text-[var(--ink-muted)] tabular-nums">
                    最近使用：{key.last_used_at ? dateTime(key.last_used_at) : '尚未使用'}
                  </small>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`删除 ${key.name}`}
                  disabled={busy || credentials.length <= 1}
                  onClick={() => onDelete(key)}
                  className="ml-auto shrink-0 text-[var(--ink-muted)] hover:bg-[#fef1f1] hover:text-destructive"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-xl bg-muted/60 px-3.5 py-2.5 text-xs leading-relaxed text-[var(--ink-muted)]">
            至少保留一个 Passkey。建议添加备用设备或安全密钥。
          </p>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-[#161922] text-[#e59a3c]">
            <Fingerprint size={20} aria-hidden="true" />
          </div>
          <CardTitle>添加备用 Passkey</CardTitle>
          <CardDescription>先验证已有凭证，再绑定新的设备或安全密钥。</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={onAdd}>
            <label
              htmlFor="key-name"
              className="block text-sm font-medium text-[var(--ink-secondary)]"
            >
              凭证名称
              <Input
                id="key-name"
                className="mt-2"
                value={keyName}
                onChange={(e) => onKeyNameChange(e.target.value)}
                required
                maxLength={80}
              />
            </label>
            <Button className="w-full" disabled={busy} type="submit">
              <Fingerprint aria-hidden="true" />
              验证并添加
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
