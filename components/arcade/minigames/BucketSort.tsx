'use client';

import { motion } from 'framer-motion';
import { useRef, useState } from 'react';

import { zoneIndexAtPagePoint } from '@/components/steps/result/dnd';
import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

import { Button } from '../../ui/Button';
import { useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard } from './ArcadeCard';
import { DraggableArcadeCard } from './DraggableArcadeCard';

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

  /**
   * Hit-test a drag release (page coords) against the bucket rects; drop into whichever zone it
   * landed on. Returns true when it landed in a bucket so the cover knows whether to spring back.
   */
  const handleDropAt = (gameId: number, point: { x: number; y: number }): boolean => {
    const idx = zoneIndexAtPagePoint(point, zoneRefs.current);
    if (idx < 0) return false;
    drop(gameId, idx);
    return true;
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

      {/* Buckets — rendered best (Top) on the right, worst (Bottom) on the left. The band *index*
          stays 0 = Top = best so the emitted `buckets` array is still best-first (what the engine
          scores); only the visual order is reversed via `renderOrder`. */}
      <div className="grid w-full max-w-3xl grid-cols-3 gap-3">
        {[...BUCKETS.keys()].reverse().map((i) => {
          const bucket = BUCKETS[i];
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
            <DraggableArcadeCard
              key={g.igdbId}
              game={g}
              ariaLabel={`Place ${g.title}`}
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
