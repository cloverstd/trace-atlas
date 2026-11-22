import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Check,
  Cloud,
  FileClock,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { Brand } from '@/components/brand';
import { cn } from '@/lib/utils';
import type { AdminTabId } from './types';

const tabs = {
  overview: {
    label: '概览',
    icon: LayoutDashboard,
    title: '探索概览',
    description: '所有走过的地方，正在这里汇聚。',
  },
  settings: {
    label: '数据源设置',
    icon: Cloud,
    title: '连接你的足迹',
    description: '从坚果云自动读取世界迷雾的云端同步文件。',
  },
  history: {
    label: '同步记录',
    icon: FileClock,
    title: '每一次更新，都有记录',
    description: '查看同步进度、处理结果和需要关注的问题。',
  },
  security: {
    label: '通行密钥',
    icon: Fingerprint,
    title: '管理通行密钥',
    description: '为同一个管理员绑定设备，安全地访问后台。',
  },
} satisfies Record<
  AdminTabId,
  { label: string; icon: typeof Cloud; title: string; description: string }
>;

const tabOrder: AdminTabId[] = ['overview', 'settings', 'history', 'security'];

export interface AdminShellProps {
  tab: AdminTabId;
  onTabChange: (tab: AdminTabId) => void;
  busy: boolean;
  onLogout: () => void;
  headerAction?: ReactNode;
  children: ReactNode;
  notification?: ReactNode;
}

export function AdminShell({
  tab,
  onTabChange,
  busy,
  onLogout,
  headerAction,
  children,
  notification,
}: AdminShellProps) {
  const currentItem = tabs[tab];

  return (
    <div className="flex min-h-dvh min-w-[1040px] bg-background">
      <aside className="sticky top-0 left-0 z-20 flex h-dvh w-[260px] shrink-0 flex-col border-r border-white/10 bg-[#14171f] px-4 pt-7 pb-5 text-[#f5f4f0]">
        <Brand compact tone="dark" className="px-2" />
        <div className="mt-9 mb-2.5 px-3 text-[11px] font-semibold tracking-[0.16em] text-[#788095]">
          工作空间
        </div>
        <nav className="flex flex-col gap-1">
          {tabOrder.map((id) => {
            const item = tabs[id];
            const active = tab === id;

            return (
              <button
                key={id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onTabChange(id)}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-xl border px-3 text-left text-sm focus-visible:outline-[#e59a3c]',
                  active
                    ? 'border-white/12 bg-white/10 font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'border-transparent text-[#9ea4b3] hover:bg-white/6 hover:text-[#f5f4f0]',
                )}
              >
                <item.icon
                  size={18}
                  className={active ? 'text-[#e59a3c]' : undefined}
                  aria-hidden="true"
                />
                {item.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="ml-auto size-1.5 rounded-full bg-[#e59a3c] shadow-[0_0_8px_rgba(229,154,60,0.8)]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-4">
          <Link
            to="/"
            className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-[#9ea4b3] transition-colors hover:bg-white/6 hover:text-white focus-visible:outline-[#e59a3c]"
          >
            <ArrowUpRight size={17} aria-hidden="true" />
            查看公开地图
          </Link>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e59a3c]/16 text-[#e59a3c] ring-1 ring-[#e59a3c]/25">
              <ShieldCheck size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <strong className="block text-xs font-semibold text-[#f5f4f0]">管理员</strong>
              <small className="block text-[11px] text-[#8d94a6]">Passkey 已验证</small>
            </div>
            <button
              type="button"
              onClick={onLogout}
              disabled={busy}
              aria-label="退出登录"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-[#9ea4b3] transition-colors focus-visible:outline-[#e59a3c] enabled:hover:bg-white/10 enabled:hover:text-[#f87171] disabled:opacity-50"
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col bg-background">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-background/88 px-10 backdrop-blur-md">
          <span className="flex items-center gap-2.5 text-sm text-[var(--ink-muted)]">
            管理后台
            <span aria-hidden="true">/</span>
            <strong className="font-medium text-foreground">{currentItem.label}</strong>
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#c7d4fe] bg-[#eef2ff] px-3 py-1 text-xs font-medium text-[#24429e]">
            <ShieldCheck size={14} aria-hidden="true" />
            安全会话
          </span>
        </header>

        <main className="mx-auto w-full max-w-[1160px] flex-1 px-10 py-9">
          <div className="mb-8 flex items-end justify-between gap-6">
            <div>
              <span className="text-[11px] font-semibold tracking-[0.16em] text-[var(--ink-muted)]">
                TRACE ATLAS / WORKSPACE
              </span>
              <h1 className="mt-1.5 text-[28px] leading-tight font-semibold tracking-tight text-foreground">
                {currentItem.title}
              </h1>
              <p className="mt-1.5 text-sm text-[var(--ink-muted)]">{currentItem.description}</p>
            </div>
            {headerAction}
          </div>
          {children}
        </main>

        <footer className="flex items-center justify-between border-t border-border px-10 py-4 text-xs text-[var(--ink-muted)]">
          <span className="tracking-[0.14em]">TRACE ATLAS</span>
          <span className="inline-flex items-center gap-1.5">
            <Check size={14} className="text-[#2c4ec7]" aria-hidden="true" />
            让足迹持续生长
          </span>
        </footer>
      </div>
      {notification}
    </div>
  );
}
