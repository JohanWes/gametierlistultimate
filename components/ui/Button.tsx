'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { forwardRef } from 'react';

import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-bg font-semibold shadow-glow hover:brightness-110 disabled:hover:brightness-100',
  secondary:
    'bg-surface-elevated text-fg border border-border hover:border-accent/60 hover:bg-surface-elevated/80',
  ghost: 'bg-transparent text-muted hover:text-fg hover:bg-surface/60',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-tile gap-1.5',
  md: 'h-11 px-5 text-[0.95rem] rounded-tile gap-2',
  lg: 'h-13 px-7 text-base rounded-card gap-2.5',
};

/** Tactile button: spring press scale, click SFX, three variants. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className, children, onClick, ...rest },
  ref,
) {
  const reduce = useReducedMotion();
  const isDisabled = disabled || loading;

  return (
    <motion.button
      ref={ref}
      type="button"
      disabled={isDisabled}
      whileTap={reduce || isDisabled ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      onClick={(e) => {
        if (isDisabled) return;
        playSound('click');
        onClick?.(e);
      }}
      className={cn(
        'inline-flex select-none items-center justify-center font-sans leading-none',
        'transition-colors duration-150 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-label="Loading"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        children
      )}
    </motion.button>
  );
});
