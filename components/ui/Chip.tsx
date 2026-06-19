'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onToggle?: (next: boolean) => void;
  className?: string;
}

/** A selectable pill (used for genre/preference picking). Fires on click and on touch. */
export function Chip({ label, selected = false, onToggle, className }: ChipProps) {
  const reduce = useReducedMotion();

  const toggle = () => {
    playSound('blip');
    onToggle?.(!selected);
  };

  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={selected}
      whileTap={reduce ? undefined : { scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 600, damping: 28 }}
      onClick={toggle}
      onTouchEnd={(e) => {
        e.preventDefault();
        toggle();
      }}
      className={cn(
        'select-none rounded-tile border px-4 py-2 text-sm font-semibold transition-colors duration-150',
        'focus-visible:outline-none',
        selected
          ? 'border-accent bg-accent text-bg shadow-soft'
          : 'border-border bg-surface text-muted hover:border-teal/60 hover:text-fg',
        className,
      )}
    >
      {label}
    </motion.button>
  );
}
