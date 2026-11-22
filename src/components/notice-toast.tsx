import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NoticeToast({
  text,
  ok = false,
  onDismiss,
  theme = 'light',
  className,
}: {
  text: string;
  ok?: boolean;
  onDismiss: () => void;
  theme?: 'light' | 'dark';
  className?: string;
}) {
  const Icon = ok ? CheckCircle2 : AlertCircle;
  const dark = theme === 'dark';

  return (
    <div
      role={ok ? 'status' : 'alert'}
      className={cn(
        'fixed inset-x-3.5 bottom-[max(16px,env(safe-area-inset-bottom))] z-50 flex items-center gap-3 rounded-2xl border py-2 pr-2 pl-3.5 text-sm leading-relaxed md:inset-x-auto md:right-6 md:bottom-6 md:max-w-[420px]',
        dark
          ? [
              'atlas-hud-glass-strong',
              ok ? 'border-[#6d8bff]/40 text-[#eef2ff]' : 'border-[#e59a3c]/40 text-[#faf6ef]',
            ]
          : [
              'shadow-[var(--shadow-elevated)]',
              ok
                ? 'border-[#c7d4fe] bg-[#f4f7ff] text-[#1f3b8c]'
                : 'border-[#f5c6c6] bg-[#fff5f5] text-[#962222]',
            ],
        className,
      )}
    >
      <Icon
        size={18}
        className={dark ? (ok ? 'text-[#a5b6ff]' : 'text-[#e59a3c]') : undefined}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 wrap-anywhere">{text}</span>
      <button
        type="button"
        aria-label="关闭提示"
        onClick={onDismiss}
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-current/10',
          dark && 'focus-visible:outline-[#e59a3c]',
        )}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
