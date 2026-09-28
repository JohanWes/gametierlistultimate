'use client';

import { tapProps } from '@/lib/tap';
import { cn } from '@/lib/utils';

import { XIcon } from './icons';

/**
 * A small circular "X" pinned to the top-right corner of a cover. Deletes the game from the pool.
 * It sits over drag/select surfaces (arcade cards, the reveal board), so every pointer/touch event
 * is stopped from propagating — otherwise pressing it would start a drag or trigger a card pick.
 * `tapProps` adds the scroll-vs-tap guard; we layer `stopPropagation` on every event so a scroll
 * or press over the X never reaches the card underneath. The card wrapper must carry `group/card`.
 */
export function RemoveButton({ onClick, title }: { onClick: () => void; title: string }) {
  const tap = tapProps(onClick);

  return (
    <button
      type="button"
      aria-label={`Remove ${title}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        tap.onClick();
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        tap.onTouchStart(e);
      }}
      onTouchMove={(e) => {
        e.stopPropagation();
        tap.onTouchMove(e);
      }}
      onTouchEnd={(e) => {
        e.stopPropagation();
        tap.onTouchEnd(e);
      }}
      className={cn(
        'absolute -right-2 -top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg text-muted shadow-soft transition-[color,border-color,opacity] duration-150 hover:border-coin hover:text-coin focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coin',
        // Mouse users see the X only on the card they're over (the art stays clean); touch has no
        // hover, so it stays visible there.
        '[@media(hover:hover)]:opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100',
      )}
    >
      <XIcon className="h-3.5 w-3.5" />
    </button>
  );
}
