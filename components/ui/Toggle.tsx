'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { playSound } from '@/lib/sound';
import { tapProps } from '@/lib/tap';
import { cn } from '@/lib/utils';

export interface ToggleProps {
  label: string;
  description?: string;
  checked?: boolean;
  onChange?: (next: boolean) => void;
  className?: string;
  /**
   * Phone-friendly variant: the switch moves under the label instead of sharing its row, and the
   * description is kept for screen readers but hidden visually. Two of these fit side by side in a
   * ~160px column without the label wrapping to three lines — the default side-by-side row can't,
   * because the 44px switch plus padding leaves under 90px for text. Unchanged from `sm` up.
   */
  compact?: boolean;
}

/** A labeled boolean switch (used for onboarding preference toggles). */
export function Toggle({
  label,
  description,
  checked = false,
  onChange,
  className,
  compact = false,
}: ToggleProps) {
  const reduce = useReducedMotion();

  const flip = () => {
    playSound('click');
    onChange?.(!checked);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      {...tapProps(flip)}
      className={cn(
        'flex w-full select-none items-center justify-between gap-4 rounded-tile border border-border',
        'bg-surface px-4 py-3 text-left shadow-soft transition-colors duration-150 hover:border-teal/50',
        'focus-visible:outline-none',
        compact && 'max-sm:flex-col max-sm:items-start max-sm:gap-2 max-sm:px-3 max-sm:py-2.5',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description ? (
          <span className={cn('block text-xs text-muted', compact && 'max-sm:sr-only')}>
            {description}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-hardware border transition-colors duration-150',
          checked ? 'border-accent bg-accent' : 'border-border bg-panel',
        )}
      >
        <motion.span
          layout={!reduce}
          transition={{ type: 'spring', stiffness: 700, damping: 34 }}
          className="absolute top-0.5 h-5 w-5 rounded-hardware bg-fg shadow-soft"
          style={{ left: checked ? 'calc(100% - 1.375rem)' : '0.125rem' }}
        />
      </span>
    </button>
  );
}
