'use client';

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { useMemo, useRef } from 'react';

import type { Game } from '@/lib/games/types';
import { TIER_ORDER, type Tier, type TierMap } from '@/lib/ranking';
import { cn } from '@/lib/utils';

import { GameCard } from '../../ui/GameCard';
import { RemoveButton } from '../../ui/RemoveButton';
import { Row } from '../../ui/Row';
import { insertionIndex, pageRectOf, tierAtPoint, type DropTarget, type TierRect } from './dnd';

// Static class maps keep Tailwind's scanner happy (no dynamic class strings).
const LABEL_BG: Record<Tier, string> = {
  S: 'bg-tier-s',
  A: 'bg-tier-a',
  B: 'bg-tier-b',
  C: 'bg-tier-c',
  D: 'bg-tier-d',
  E: 'bg-tier-e',
  F: 'bg-tier-f',
};

const ROW_TINT: Record<Tier, string> = {
  S: 'shadow-[inset_3px_0_0_rgb(var(--tier-s))]',
  A: 'shadow-[inset_3px_0_0_rgb(var(--tier-a))]',
  B: 'shadow-[inset_3px_0_0_rgb(var(--tier-b))]',
  C: 'shadow-[inset_3px_0_0_rgb(var(--tier-c))]',
  D: 'shadow-[inset_3px_0_0_rgb(var(--tier-d))]',
  E: 'shadow-[inset_3px_0_0_rgb(var(--tier-e))]',
  F: 'shadow-[inset_3px_0_0_rgb(var(--tier-f))]',
};

export interface TierBoardProps {
  tiers: TierMap;
  /** Lookup for the games referenced by id in `tiers`. */
  gamesById: Map<number, Game>;
  /**
   * When provided, reveal mode renders only these tiers as a compact ladder.
   * Omit for a fully-revealed, static board (the public share view).
   */
  visibleTiers?: Set<Tier>;
  /** When provided, cards become movable (drag between rows + tap to pick a tier). */
  onMove?: (gameId: number, from: Tier, to: Tier, toIndex: number) => void;
  /** Tap a cover to open the tier picker (the touch-first move path). */
  onPick?: (game: Game, from: Tier) => void;
  /** When provided, each movable cover shows a delete-X that removes the game from the pool. */
  onRemove?: (game: Game, from: Tier) => void;
  /** Play the one-shot S-tier coronation (bloom + glow + marquee + coin burst) on the S row. */
  coronate?: boolean;
  className?: string;
}

/**
 * The classic S–F tier list: a colored letter label per row and the user's covers arranged inside.
 * Data-driven so the same component renders the owner's editable board and the read-only share view.
 * Interactive rows (when `onMove` is set) drop the overflow clipping and wrap so a dragged cover can
 * float freely across rows.
 */
export function TierBoard({
  tiers,
  gamesById,
  visibleTiers,
  onMove,
  onPick,
  onRemove,
  coronate,
  className,
}: TierBoardProps) {
  const revealing = visibleTiers !== undefined;
  const interactive = typeof onMove === 'function';
  const renderedTiers = revealing
    ? TIER_ORDER.filter((tier) => visibleTiers.has(tier))
    : TIER_ORDER;
  const rowRefs = useRef<Partial<Record<Tier, HTMLDivElement | null>>>({});

  // Which tier row + insertion index the cursor (in page coordinates) lands on. The dragged
  // `gameId` is excluded so the index is computed against the row's other cards. Returns null
  // when the cursor is outside every row.
  const resolveDrop = (
    point: { x: number; y: number },
    excludeId: number,
  ): DropTarget | null => {
    const rects: TierRect[] = [];
    for (const tier of TIER_ORDER) {
      const el = rowRefs.current[tier];
      if (!el) continue;
      rects.push({ tier, rect: pageRectOf(el) });
    }
    const tier = tierAtPoint(point, rects);
    if (!tier) return null;

    // Insertion index from the cursor's x vs the target row's card centers (excluding the
    // dragged card). Card centers are in page coordinates to match `info.point`.
    const rowEl = rowRefs.current[tier];
    const centers: number[] = [];
    if (rowEl) {
      const cards = rowEl.querySelectorAll<HTMLElement>('[data-card-id]');
      cards.forEach((card) => {
        const id = Number(card.getAttribute('data-card-id'));
        if (!Number.isFinite(id) || id === excludeId) return;
        const cr = pageRectOf(card);
        centers.push((cr.left + cr.right) / 2);
      });
    }
    return { tier, index: insertionIndex(point.x, centers) };
  };

  return (
    <div className={className} data-testid="tier-board">
      <div className="flex flex-col gap-2.5">
        <AnimatePresence initial={false}>
          {renderedTiers.map((tier) => {
            const ids = tiers[tier];

            // Editable rows: no overflow clip, wrap, and a drop-target attribute.
            if (interactive) {
              return (
                <div
                  key={tier}
                  data-testid={`tier-row-${tier}`}
                  data-tier={tier}
                  ref={(el) => {
                    rowRefs.current[tier] = el;
                  }}
                  className={cn(
                    'relative isolate flex items-stretch gap-3 rounded-card border border-border bg-surface shadow-cabinet',
                    ROW_TINT[tier],
                  )}
                >
                  {coronate && tier === 'S' ? <SCoronation /> : null}
                  <div
                    className={cn(
                      'flex w-14 shrink-0 flex-col items-center justify-center py-4 sm:w-16',
                      LABEL_BG[tier],
                    )}
                  >
                    <span className="font-display text-2xl font-extrabold text-black/85 sm:text-3xl">
                      {tier}
                    </span>
                    <span className="font-mono text-[0.65rem] text-black/60">{ids.length}</span>
                  </div>
                  <div className="flex min-h-[140px] flex-1 flex-wrap content-center items-center gap-2.5 py-3 pr-3">
                    {ids.map((id, idx) => {
                      const game = gamesById.get(id);
                      if (!game) return null;
                      return (
                        <MovableCard
                          key={id}
                          game={game}
                          from={tier}
                          fromIndex={idx}
                          resolveDrop={resolveDrop}
                          onMove={onMove}
                          onPick={onPick}
                          onRemove={onRemove}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            }

            // Read-only / reveal rows: during reveal, only shown tiers exist in the stack. Because
            // rows are filtered in S→F order, each newly revealed tier appears above the previous one.
            return (
              <motion.div
                key={tier}
                layout
                data-testid={`tier-row-${tier}`}
                ref={(el) => {
                  rowRefs.current[tier] = el;
                }}
                initial={revealing ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.22, ease: 'easeOut', layout: { duration: 0.28 } }}
              >
                <div className={cn('rounded-card', revealing && 'crt-boot')}>
                  {revealing ? <span aria-hidden className="crt-scanline" /> : null}
                  <Row tier={tier} count={ids.length}>
                    {ids.map((id, idx) => {
                      const game = gamesById.get(id);
                      if (!game) return null;
                      return <RevealCard key={id} game={game} animateIn={revealing} index={idx} />;
                    })}
                  </Row>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A static cover that fades up when its row reveals. */
function RevealCard({
  game,
  animateIn,
  index,
}: {
  game: Game;
  animateIn: boolean;
  index: number;
}) {
  return (
    <motion.div
      initial={animateIn ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay: Math.min(index * 0.04, 0.3) }}
    >
      <GameCard game={game} size="sm" />
    </motion.div>
  );
}

/** A draggable cover. Drag to another row (or to reorder within a row), or tap to pick a tier. */
function MovableCard({
  game,
  from,
  fromIndex,
  resolveDrop,
  onMove,
  onPick,
  onRemove,
}: {
  game: Game;
  from: Tier;
  fromIndex: number;
  resolveDrop: (point: { x: number; y: number }, excludeId: number) => DropTarget | null;
  onMove: (gameId: number, from: Tier, to: Tier, toIndex: number) => void;
  onPick?: (game: Game, from: Tier) => void;
  onRemove?: (game: Game, from: Tier) => void;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const draggedRef = useRef(false);
  const resetRef = useRef<ReturnType<typeof animate>[]>([]);

  const stopReset = () => {
    resetRef.current.forEach((controls) => controls.stop());
    resetRef.current = [];
  };

  const resetDragOffset = (instant = false) => {
    stopReset();
    if (instant || reduce) {
      x.set(0);
      y.set(0);
      return;
    }
    resetRef.current = [
      animate(x, 0, { type: 'spring', stiffness: 520, damping: 36 }),
      animate(y, 0, { type: 'spring', stiffness: 520, damping: 36 }),
    ];
  };

  const open = () => {
    if (draggedRef.current) return;
    onPick?.(game, from);
  };

  return (
    <motion.div
      data-card-id={game.igdbId}
      role="button"
      tabIndex={0}
      aria-label={`Move ${game.title}`}
      layout="position"
      drag={!reduce}
      dragMomentum={false}
      style={reduce ? undefined : { x, y }}
      whileDrag={{ scale: 1.08, zIndex: 50 }}
      onDragStart={() => {
        stopReset();
        draggedRef.current = true;
      }}
      onDragEnd={(_event, info) => {
        // Hit-test the cursor itself (info.point is page coordinates) — not the card center —
        // so an off-center grab still drops into the row under the pointer. This fixes the
        // "snaps back" bug where a bottom-grab lifted up would land the card center in its
        // original row even though the cursor reached the target row.
        const drop = resolveDrop(info.point, game.igdbId);
        let moved = false;
        if (drop) {
          const sameTierSameSpot = drop.tier === from && drop.index === fromIndex;
          if (!sameTierSameSpot) {
            moved = true;
            onMove(game.igdbId, from, drop.tier, drop.index);
          }
        }
        // A successful move is now represented by the new layout position, so clear the drag
        // offset immediately. Misses/same-slot drops spring back to the current slot.
        resetDragOffset(moved);
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 60);
      }}
      onClick={open}
      onTouchEnd={(e) => {
        e.preventDefault();
        open();
      }}
      className="relative cursor-grab touch-none rounded-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
    >
      <GameCard game={game} size="sm" />
      {onRemove ? <RemoveButton onClick={() => onRemove(game, from)} title={game.title} /> : null}
    </motion.div>
  );
}

const BURST_COLORS = ['var(--tier-s)', 'var(--color-accent)', 'var(--color-teal)', 'var(--color-coin)'];

/**
 * One-shot crescendo over the S row: a glow ring, a bloom, a traveling marquee light, and a coin
 * burst flung up from the row's center. CSS owns the first three (see globals.css); the particles
 * are Framer so each gets its own trajectory. Mounted only for the coronation window, then unmounted
 * by the parent — no exit choreography needed.
 */
function SCoronation() {
  const particles = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        // Fan upward and out: angles biased to the top hemisphere so coins arc over the covers.
        const angle = -Math.PI / 2 + (((i / 22) * 2 - 1) * Math.PI * 0.82);
        const dist = 96 + ((i * 53) % 78);
        return {
          id: i,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          rot: ((i * 67) % 2 ? 1 : -1) * (140 + ((i * 37) % 220)),
          size: 5 + ((i * 13) % 6),
          color: BURST_COLORS[i % BURST_COLORS.length],
          delay: ((i * 17) % 5) * 0.014,
        };
      }),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <span className="s-crown-bloom" />
      <span className="s-crown-ring" />
      <span className="marquee-frame" />
      <div className="absolute left-1/2 top-1/2 h-0 w-0">
        {particles.map((p) => (
          <motion.span
            key={p.id}
            className="absolute rounded-[2px]"
            style={{
              width: p.size,
              height: p.size,
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
              backgroundColor: `rgb(${p.color})`,
              boxShadow: `0 0 6px rgb(${p.color} / 0.7)`,
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            animate={{ x: p.dx, y: p.dy, opacity: [0, 1, 1, 0], scale: 1, rotate: p.rot }}
            transition={{ duration: 0.78, ease: [0.22, 1, 0.36, 1], delay: p.delay, times: [0, 0.12, 0.7, 1] }}
          />
        ))}
      </div>
    </div>
  );
}
