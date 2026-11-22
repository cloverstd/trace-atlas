import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Compass,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function AdminAuthLoadingView({ fatal }: { fatal: string }) {
  return (
    <main className="atlas-coord-bg flex min-h-dvh min-w-[1040px] flex-col px-12 py-9">
      <div>
        <Brand tone="light" />
      </div>
      <Card className="m-auto w-full max-w-[420px] rounded-3xl border-border shadow-[var(--shadow-elevated)]">
        <CardHeader className="items-start p-8">
          <div
            className={cn(
              'mb-3 grid size-14 place-items-center rounded-2xl',
              fatal
                ? 'bg-[#fef1f1] text-[#c23636] ring-1 ring-[#f7c8c8]'
                : 'bg-[#161922] text-[#e59a3c]',
            )}
          >
            {fatal ? (
              <AlertTriangle size={28} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Compass size={28} strokeWidth={1.5} className="spin" aria-hidden="true" />
            )}
          </div>
          <CardTitle className="text-xl">{fatal ? '后台暂时不可用' : '正在连接后台'}</CardTitle>
          <CardDescription>{fatal || '正在检查管理员配置…'}</CardDescription>
        </CardHeader>
        {fatal && (
          <CardContent className="px-8 pb-8">
            <Button type="button" onClick={() => location.reload()}>
              重试
            </Button>
          </CardContent>
        )}
      </Card>
    </main>
  );
}

export interface AdminAuthViewProps {
  initialized: boolean;
  busy: boolean;
  token: string;
  onTokenChange: (value: string) => void;
  onLogin: () => void;
  onBootstrap: (e: FormEvent) => void;
  notification?: ReactNode;
}

export function AdminAuthView({
  initialized,
  busy,
  token,
  onTokenChange,
  onLogin,
  onBootstrap,
  notification,
}: AdminAuthViewProps) {
  return (
    <main className="atlas-coord-bg flex min-h-dvh min-w-[1040px] flex-col justify-between px-12 py-9">
      <header className="flex items-center justify-between">
        <Brand tone="light" />
        <Button asChild variant="outline" size="sm" className="rounded-full border-border px-4">
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            返回地图
          </Link>
        </Button>
      </header>

      <div className="mx-auto my-auto grid w-full max-w-[980px] grid-cols-[1.2fr_1fr] items-center gap-16 py-10">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/85 px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-[#3f4452] shadow-2xs">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[#e59a3c]" />
            YOUR JOURNEY, IN GOOD HANDS
          </span>
          <h1 className="mt-5 text-[44px] leading-[1.18] font-semibold tracking-tight text-[#161922]">
            整理足迹，
            <br />
            继续探索。
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-[var(--ink-secondary)]">
            连接世界迷雾数据，让每一段旅程
            <br />
            在自己的地图上延续。
          </p>
          <ul className="mt-9 grid max-w-[380px] gap-3 text-sm font-medium text-[var(--ink-secondary)]">
            <li className="flex items-center gap-3 rounded-2xl border border-border/90 bg-white/75 px-4 py-3 backdrop-blur-xs">
              <span className="grid size-9 place-items-center rounded-xl bg-[#161922] text-[#e59a3c]">
                <ShieldCheck size={17} aria-hidden="true" />
              </span>
              单管理员，安全访问
            </li>
            <li className="flex items-center gap-3 rounded-2xl border border-border/90 bg-white/75 px-4 py-3 backdrop-blur-xs">
              <span className="grid size-9 place-items-center rounded-xl bg-[#eef2ff] text-[#2c4ec7]">
                <RefreshCw size={17} aria-hidden="true" />
              </span>
              自动同步，持续更新
            </li>
          </ul>
        </div>

        <Card className="w-full max-w-[420px] justify-self-end overflow-hidden rounded-3xl border-border/95 shadow-[var(--shadow-elevated)]">
          <div
            aria-hidden="true"
            className="h-1 w-full bg-gradient-to-r from-[#161922] via-[#e59a3c] to-[#2c4ec7]"
          />
          <CardHeader className="p-8 pb-5">
            <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-[#161922] text-[#e59a3c] shadow-sm ring-4 ring-[#161922]/6">
              <Fingerprint size={30} strokeWidth={1.5} aria-hidden="true" />
            </div>
            <CardTitle className="text-xl font-semibold">
              {initialized ? '欢迎回来' : '初始化管理员'}
            </CardTitle>
            <CardDescription>
              {initialized
                ? '使用设备上的 Passkey 安全登录。'
                : '输入部署时设置的一次性口令，绑定第一个 Passkey。'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            {initialized ? (
              <>
                <Button size="lg" className="w-full" disabled={busy} onClick={onLogin}>
                  <Fingerprint aria-hidden="true" />
                  {busy ? '正在验证…' : '使用 Passkey 登录'}
                </Button>
                <p className="mt-5 text-center text-xs leading-relaxed text-[var(--ink-muted)]">
                  支持指纹、面容识别或安全密钥。
                  <br />
                  本站不使用账号密码登录。
                </p>
              </>
            ) : (
              <form onSubmit={onBootstrap} className="space-y-5">
                <label
                  htmlFor="bootstrap-token"
                  className="block text-sm font-medium text-[var(--ink-secondary)]"
                >
                  初始化口令
                  <Input
                    id="bootstrap-token"
                    className="mt-2 h-11"
                    type="password"
                    autoComplete="off"
                    required
                    minLength={32}
                    value={token}
                    onChange={(e) => onTokenChange(e.target.value)}
                    placeholder="输入一次性初始化口令"
                  />
                </label>
                <Button size="lg" className="w-full" disabled={busy} type="submit">
                  <Fingerprint aria-hidden="true" />
                  {busy ? '正在绑定…' : '创建管理员 Passkey'}
                </Button>
                <p className="text-center text-xs leading-relaxed text-[var(--ink-muted)]">
                  完成后初始化入口会关闭，
                  <br />
                  之后仅通过 Passkey 登录。
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      <footer className="text-center text-xs tracking-[0.16em] text-[var(--ink-muted)]">
        TRACE ATLAS · 留下每一步探索的印记
      </footer>
      {notification}
    </main>
  );
}
