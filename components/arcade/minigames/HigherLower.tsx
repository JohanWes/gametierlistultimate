'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useRef, useState } from 'react';

import type { Game } from '@/lib/games/types';
import type { RankingOutcome } from '@/lib/ranking';
import { playSound } from '@/lib/sound';
import { clamp, cn } from '@/lib/utils';

import { tapProps, useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard, type CardState } from './ArcadeCard';

type Placement = 'crushes' | 'above' | 'same' | 'below' | 'buried';

const PLACEMENTS: {
  placement: Placement;
  label: string;
  shortLabel: string;
  helper: string;
  y: number;
}[] = [
  { placement: 'crushes', label: 'Crushes it', shortLabel: '++', helper: 'Way above benchmark', y: 0 },
  { placement: 'above', label: 'Above', shortLabel: '+', helper: 'Better than benchmark', y: 25 },
  { placement: 'same', label: 'Same shelf', shortLabel: '=', helper: 'About equal', y: 50 },
  { placement: 'below', label: 'Below', shortLabel: '-', helper: 'Worse than benchmark', y: 75 },
  { placement: 'buried', label: 'Buried', shortLabel: '--', helper: 'Way below benchmark', y: 100 },
];

const STRONG_WEIGHT = 1.35;

/**
 * Minigame 6 — "Stack gauge". Place the challenger on a calibrated rail relative to a locked
 * benchmark. The round still emits the existing pairwise/about-equal/skip outcomes, with stronger
 * weights at the rail extremes.
 */
export function HigherLower({ games, anchorId, onComplete }: MinigameProps) {
  const reduce = useReducedMotion();
  const complete = useComplete(onComplete);
  const railRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [selected, setSelected] = useState<Placement | null>(null);
  const [locked, setLocked] = useState(false);

  if (games.length < 2) return null;
  const anchor = games.find((g) => g.igdbId === anchorId) ?? games[0];
  const challenger = games.find((g) => g.igdbId !== anchor.igdbId) ?? games[1];

  const selectedStop = selected ? PLACEMENTS.find((p) => p.placement === selected) ?? null : null;

  const placementFromY = (clientY: number): Placement => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return selected ?? 'same';
    const position = clamp((clientY - rect.top) / rect.height, 0, 1);
    const index = Math.round(position * (PLACEMENTS.length - 1));
    return PLACEMENTS[index].placement;
  };

  const choose = (placement: Placement) => {
    if (locked) return;
    setSelected(placement);
    playSound('blip');
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (locked) return;
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    choose(placementFromY(e.clientY));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || locked) return;
    choose(placementFromY(e.clientY));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const outcomeFor = (placement: Placement): RankingOutcome => {
    const ids: [number, number] = [challenger.igdbId, anchor.igdbId];
    switch (placement) {
      case 'crushes':
        return {
          type: 'pairwise',
          winnerId: challenger.igdbId,
          loserId: anchor.igdbId,
          weight: STRONG_WEIGHT,
        };
      case 'above':
        return { type: 'pairwise', winnerId: challenger.igdbId, loserId: anchor.igdbId };
      case 'same':
        return { type: 'about-equal', gameIds: ids };
      case 'below':
        return { type: 'pairwise', winnerId: anchor.igdbId, loserId: challenger.igdbId };
      case 'buried':
        return {
          type: 'pairwise',
          winnerId: anchor.igdbId,
          loserId: challenger.igdbId,
          weight: STRONG_WEIGHT,
        };
    }
  };

  const lockPlacement = () => {
    if (!selected || locked) return;
    setLocked(true);
    playSound(selected === 'same' ? 'click' : 'success');
    complete([outcomeFor(selected)]);
  };

  const skip = () => {
    if (locked) return;
    setLocked(true);
    playSound('click');
    complete([{ type: 'skip', gameIds: [challenger.igdbId, anchor.igdbId] }]);
  };

  const anchorState = cardStateFor('anchor', selected, locked);
  const challengerState = cardStateFor('challenger', selected, locked);

  return (
    <div className="flex flex-col items-center">
      <header className="mb-6 text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.28em] text-teal">Stack gauge</p>
        <h2 className="font-display text-3xl font-black uppercase tracking-[0.02em] text-fg sm:text-4xl">
          Where does this land?
        </h2>
      </header>

      <div className="grid w-full max-w-3xl grid-cols-1 items-center gap-6 sm:grid-cols-[minmax(0,1fr)_11rem_minmax(0,1fr)] sm:gap-7">
        <Benchmark game={anchor} state={anchorState} />

        <div className="order-3 flex flex-col items-center sm:order-none">
          <div
            ref={railRef}
            role="slider"
            aria-label={`Place ${challenger.title} against ${anchor.title}`}
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={PLACEMENTS.length - 1}
            aria-valuenow={selectedStop ? PLACEMENTS.indexOf(selectedStop) : undefined}
            aria-valuetext={selectedStop?.label ?? 'unplaced'}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={cn(
              'relative h-56 w-24 touch-none select-none rounded-tile border border-border bg-panel shadow-cabinet',
              locked ? 'cursor-default' : 'cursor-pointer',
            )}
          >
            <span
              aria-hidden
              className="absolute bottom-4 left-1/2 top-4 w-[3px] -translate-x-1/2 rounded-full"
              style={{
                background:
                  'linear-gradient(to bottom, rgb(var(--color-teal)), rgb(var(--color-accent)) 50%, rgb(var(--color-coin)))',
              }}
            />

            {PLACEMENTS.map((stop) => {
              const active = selected === stop.placement;
              return (
                <button
                  key={stop.placement}
                  type="button"
                  disabled={locked}
                  aria-label={stop.label}
                  title={stop.helper}
                  onPointerDown={(e) => e.stopPropagation()}
                  {...tapProps(() => choose(stop.placement))}
                  className={cn(
                    'absolute left-1/2 z-10 flex h-9 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-hardware border font-display text-xs font-black uppercase tracking-[0.08em] transition-colors duration-150 focus-visible:outline-none',
                    active
                      ? 'border-accent bg-accent text-bg shadow-soft'
                      : 'border-border bg-bg text-muted hover:border-teal/70 hover:text-fg',
                    locked && !active && 'opacity-35',
                  )}
                  style={{ top: `${stop.y}%` }}
                >
                  {stop.shortLabel}
                </button>
              );
            })}

            {selectedStop ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute right-[-0.65rem] z-20 h-4 w-4 -translate-y-1/2 rotate-45 border border-accent bg-accent"
                initial={reduce ? false : { opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1, top: `${selectedStop.y}%` }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 28 }}
              />
            ) : null}
          </div>

          <span className="mt-3 min-h-4 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">
            {selectedStop?.helper ?? 'Tap or drag the gauge'}
          </span>
        </div>

        <Challenger game={challenger} state={challengerState} selectedStop={selectedStop} />
      </div>

      <div className="mt-7 grid w-full max-w-md grid-cols-[1fr_auto] gap-2.5">
        <button
          type="button"
          disabled={!selected || locked}
          {...tapProps(lockPlacement)}
          className="select-none rounded-tile border border-teal bg-teal/15 px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.06em] text-teal transition-colors duration-150 hover:bg-teal/25 focus-visible:outline-none disabled:opacity-45"
        >
          Lock placement
        </button>
        <button
          type="button"
          disabled={locked}
          {...tapProps(skip)}
          className="select-none rounded-tile border border-transparent px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.06em] text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-none disabled:opacity-45"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function cardStateFor(card: 'anchor' | 'challenger', selected: Placement | null, locked: boolean): CardState {
  if (!locked || !selected) return 'idle';
  if (selected === 'same') return 'equal';
  const challengerWins = selected === 'crushes' || selected === 'above';
  if (card === 'challenger') return challengerWins ? 'win' : 'lose';
  return challengerWins ? 'lose' : 'win';
}

function Benchmark({ game, state }: { game: Game; state: CardState }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="rounded-hardware border border-accent/60 bg-accent/10 px-2.5 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.18em] text-accent">
        Benchmark
      </span>
      <div className="rounded-tile border border-accent/35 bg-accent/10 p-2 shadow-cabinet">
        <ArcadeCard game={game} state={state} />
      </div>
    </div>
  );
}

function Challenger({
  game,
  state,
  selectedStop,
}: {
  game: Game;
  state: CardState;
  selectedStop: (typeof PLACEMENTS)[number] | null;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="rounded-hardware border border-teal/60 bg-teal/10 px-2.5 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.18em] text-teal">
        Challenger
      </span>
      <motion.div
        animate={selectedStop ? { y: (selectedStop.y - 50) * 0.2 } : { y: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      >
        <ArcadeCard game={game} state={state} />
      </motion.div>
      <span className="min-h-4 font-display text-sm font-black uppercase tracking-[0.05em] text-fg">
        {selectedStop?.label ?? 'Unplaced'}
      </span>
    </div>
  );
}
