import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function Brand({
  compact = false,
  variant = 'default',
  tone = variant === 'floating' ? 'dark' : 'light',
  className,
}: {
  compact?: boolean;
  variant?: 'default' | 'floating';
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const dark = tone === 'dark';

  return (
    <Link
      to="/"
      aria-label="Trace Atlas 首页"
      className={cn(
        'brand inline-flex items-center gap-2.5 text-xl leading-none md:gap-3 md:text-[25px]',
        variant === 'floating' && [
          'atlas-hud-glass rounded-2xl px-3 py-2 md:px-4 md:py-2.5',
          !dark && 'border-border bg-white/95 shadow-[var(--shadow-card)]',
        ],
        dark && 'focus-visible:outline-[#e59a3c]',
        className,
      )}
    >
      <span
        className={cn(
          'brand-mark grid size-9 shrink-0 place-items-center rounded-[10px] text-[#e59a3c] md:size-10 md:rounded-xl',
          dark ? 'bg-[#222633] ring-1 ring-[#e59a3c]/30' : 'bg-[#161922] shadow-sm',
        )}
      >
        <svg className="size-6 md:size-7" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="M7 23 13 7l5 12 7-10M5 25l20-4"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="13" cy="7" r="2.3" fill="currentColor" />
        </svg>
      </span>
      <span>
        <span
          className={cn('font-bold tracking-tight', dark ? 'text-[#f8f8f6]' : 'text-[#161922]')}
        >
          trace
        </span>
        <span
          className={cn('font-light tracking-tight', dark ? 'text-[#d4d7e0]' : 'text-[#585f70]')}
        >
          atlas
        </span>
        {!compact && (
          <small
            className={cn(
              'mt-0.5 block text-[10px] leading-none tracking-[0.14em] md:text-[11px]',
              dark ? 'text-[#a9afbf]' : 'text-muted-foreground',
            )}
          >
            每一步，都有迹可循
          </small>
        )}
      </span>
    </Link>
  );
}
