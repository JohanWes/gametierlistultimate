'use client';

import { type PanInfo, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useRef, useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

import { Button } from '../../ui/Button';
import { useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard } from './ArcadeCard';

/** The three buckets, ordered best → worst (this order is the ranking the engine scores). */
const BUCKETS = [
  { key: 'top', label: 'Top', sub: 'The greats', accent: 'teal' },
  { key: 'mid', label: 'Middle', sub: 'Solid picks', accent: 'accent' },
  { key: 'bottom', label: 'Bottom', sub: 'The rest', accent: 'coin' },
] as const;

const ACCENT_RING: Record<string, string> = {
  teal: 'border-teal/60',
  accent: 'border-accent/60',
  coin: 'border-coin/60',
};
const ACCENT_TEXT: Record<string, string> = {
  teal: 'text-teal',
  accent: 'text-accent',
  coin: 'text-coin',
};

/**
 * A draggable cover with a deliberately heavy feel: it lifts and tilts when grabbed, lags the
 * pointer a touch via a low-elasticity weighty spring, and lands with a thunk when dropped into a
 * bucket. `onTap` is the accessible fallback — tap to pick up, then tap a bucket to drop.
 */
function HeavyCard({
  game,
  picked,
  onTap,
  onDropAt,
}: {
  game: Game;
  picked: boolean;
  onTap: () => void;
  onDropAt: (point: { x: number; y: number }) => void;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  // Tilt toward the drag direction — the cover reads as having weight that swings behind the pointer.
  const rotate = useTransform(x, [-160, 0, 160], [-9, 0, 9]);

  return (
    <motion.div
      role="button"
      tabIndex={0}
      aria-label={`Place ${game.title}`}
      className="cursor-grab touch-none select-none rounded-tile active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={reduce ? undefined : { x, rotate }}
      drag={reduce ? false : true}
      dragSnapToOrigin
      dragElastic={0.12}
      dragTransition={{ power: 0.18, timeConstant: 360, bounceStiffness: 240, bounceDamping: 34 }}
      whileDrag={{ scale: 1.08, zIndex: 50, cursor: 'grabbing' }}
      onDragStart={() => {
        playSound('blip');
      }}
      onDragEnd={(_e, info: PanInfo) => onDropAt({ x: info.point.x, y: info.point.y })}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
      animate={picked ? { scale: 1.05 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26, mass: 1.1 }}
    >
      <ArcadeCard
        game={game}
        size="sm"
        state={picked ? 'win' : 'idle'}
        className={picked ? 'shadow-[0_18px_40px_rgb(0_0_0/0.5)]' : undefined}
      />
    </motion.div>
  );
}

/**
 * Minigame — "Tier Drop." Sort a handful of covers into three ordered buckets (Top / Middle /
 * Bottom). One round emits a single `bucket` outcome, from which the engine derives every
 * cross-bucket implication at once — the fastest way to spread ratings toward the extremes.
 *
 * Two ways to place, both mouse + touch: drag a cover into a bucket (with a weighty, tactile feel),
 * or tap a cover to pick it up and tap a bucket to drop it. No keyboard dependency.
 */
export function BucketSort({ games, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [placement, setPlacement] = useState<Record<number, number>>({});
  const [picked, setPicked] = useState<number | null>(null);
  const [pulsed, setPulsed] = useState<number | null>(null);
  const zoneRefs = useRef<(HTMLDivElement | null)[]>([]);

  if (games.length === 0) return null;

  const placedCount = Object.keys(placement).length;
  const allPlaced = placedCount === games.length;

  const drop = (gameId: number, bucket: number) => {
    playSound('click');
    setPlacement((prev) => ({ ...prev, [gameId]: bucket }));
    setPicked(null);
    setPulsed(bucket);
    window.setTimeout(() => setPulsed((b) => (b === bucket ? null : b)), 360);
  };

  const unplace = (gameId: number) => {
    playSound('blip');
    setPlacement((prev) => {
      const next = { ...prev };
      delete next[gameId];
      return next;
    });
  };

  /** Hit-test a drag release against the bucket rects; drop into whichever zone it landed on. */
  const handleDropAt = (gameId: number, point: { x: number; y: number }) => {
    const idx = zoneRefs.current.findIndex((el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
    });
    if (idx >= 0) drop(gameId, idx);
  };

  const tapCard = (gameId: number) => {
    playSound('blip');
    setPicked((cur) => (cur === gameId ? null : gameId));
  };

  const tapBucket = (bucket: number) => {
    if (picked === null) return;
    drop(picked, bucket);
  };

  const lockIn = () => {
    if (!allPlaced) return;
    playSound('success');
    const buckets = BUCKETS.map((_, i) =>
      games.filter((g) => placement[g.igdbId] === i).map((g) => g.igdbId),
    );
    complete([{ type: 'bucket', buckets }]);
  };

  const tray = games.filter((g) => placement[g.igdbId] === undefined);

  return (
    <div className="flex flex-col items-center">
      <header className="mb-6 text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.28em] text-accent">Tier drop</p>
        <h2 className="font-display text-3xl font-black uppercase tracking-[0.02em] text-fg sm:text-4xl">
          Sort them into buckets.
        </h2>
        <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted">
          {picked !== null ? 'Now tap a bucket' : 'Drag a cover — or tap it, then a bucket'}
        </p>
      </header>

      {/* Buckets */}
      <div className="grid w-full max-w-3xl grid-cols-3 gap-3">
        {BUCKETS.map((bucket, i) => {
          const contents = games.filter((g) => placement[g.igdbId] === i);
          return (
            <motion.div
              key={bucket.key}
              ref={(el) => {
                zoneRefs.current[i] = el;
              }}
              role="button"
              tabIndex={0}
              aria-label={`${bucket.label} bucket`}
              onClick={() => tapBucket(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  tapBucket(i);
                }
              }}
              animate={pulsed === i ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ duration: 0.36 }}
              className={cn(
                'flex min-h-[200px] flex-col rounded-tile border-2 border-dashed bg-surface/20 p-2.5 transition-colors',
                ACCENT_RING[bucket.accent],
                picked !== null && 'cursor-pointer border-solid bg-surface/40',
              )}
            >
              <div className="mb-2 text-center">
                <span className={cn('font-display text-lg font-black uppercase', ACCENT_TEXT[bucket.accent])}>
                  {bucket.label}
                </span>
                <span className="block font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
                  {bucket.sub}
                </span>
              </div>
              <div className="flex flex-1 flex-wrap content-start justify-center gap-2">
                {contents.map((g) => (
                  <motion.button
                    key={g.igdbId}
                    type="button"
                    layout
                    aria-label={`Remove ${g.title} from ${bucket.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      unplace(g.igdbId);
                    }}
                    className="rounded-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ArcadeCard game={g} size="sm" />
                  </motion.button>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Tray of unplaced covers */}
      <div className="mt-6 flex min-h-[160px] w-full max-w-3xl flex-wrap justify-center gap-3 border-t border-border pt-5">
        {tray.length > 0 ? (
          tray.map((g) => (
            <HeavyCard
              key={g.igdbId}
              game={g}
              picked={picked === g.igdbId}
              onTap={() => tapCard(g.igdbId)}
              onDropAt={(point) => handleDropAt(g.igdbId, point)}
            />
          ))
        ) : (
          <Button onClick={lockIn} disabled={!allPlaced}>
            Lock in buckets →
          </Button>
        )}
      </div>
    </div>
  );
}
