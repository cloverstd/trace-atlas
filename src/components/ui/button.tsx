import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,scale,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 forced-colors:focus-visible:outline-solid [&_svg]:size-4',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(15,18,28,0.18)] hover:bg-[#252a38] active:scale-[0.98]',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent active:scale-[0.98]',
        outline:
          'border border-input bg-white text-foreground shadow-[0_1px_2px_rgba(15,18,28,0.04)] hover:bg-accent/70 hover:border-[#c2bfb4] active:scale-[0.98]',
        ghost: 'text-[var(--ink-secondary)] hover:bg-accent/80 hover:text-foreground',
        destructive:
          'bg-destructive text-destructive-foreground shadow-[0_1px_2px_rgba(120,25,25,0.16)] hover:bg-[#a82b2b] active:scale-[0.98]',
      },
      size: {
        default: 'h-10 px-4 text-sm rounded-xl',
        sm: 'h-8.5 px-3 text-xs rounded-lg',
        lg: 'h-11 px-5 text-sm rounded-xl',
        icon: 'h-10 w-10 rounded-xl',
        'icon-sm': 'h-9 w-9 rounded-lg',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
