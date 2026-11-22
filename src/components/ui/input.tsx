import * as React from 'react';
import { cn } from '@/lib/utils';
export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        'flex h-10 w-full rounded-xl border border-input bg-white px-3.5 py-2 text-sm text-foreground shadow-[0_1px_2px_rgba(15,18,28,0.03)] transition-colors placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:border-[#3358d4] focus-visible:ring-3 focus-visible:ring-[#3358d4]/15 read-only:bg-muted/80 read-only:text-[var(--ink-secondary)] disabled:cursor-not-allowed disabled:opacity-50 forced-colors:focus-visible:outline-solid',
        className,
      )}
      {...props}
    />
  );
}
