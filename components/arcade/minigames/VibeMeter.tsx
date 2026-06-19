'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useRef, useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import { clamp } from '@/lib/utils';

import { Button } from '../../ui/Button';
import { useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard } from './ArcadeCard';

/** Subtle reference marks on the meter — labels at the top, mid and bottom of the 0–100 range. */
const SCALE_MARKS = [100, 75, 50, 25, 0];

function VibeRow({
  game,
  score,
  onChange,
}: {
  game: Game;
  score: number | null;
  onChange: (score: number) => void;
}) {
  const reduce = useReducedMotion();
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  /** clientY → 0–100 score; top of the bar is 100, bottom is 0. */
  const scoreFromEvent = (clientY: number): number => {
    const el = barRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return 0;
    const pos = clamp((clientY - rect.top) / rect.height, 0, 1);
    return Math.round((1 - pos) * 100);
  };

  const update = (newScore: number) => {
    if (newScore !== score) {
      playSound('blip');
      onChange(newScore);
    }
  };

  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    update(scoreFromEvent(e.clientY));
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    update(scoreFromEvent(e.clientY));
  };

  const handleUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget?.releasePointerCapture?.(e.pointerId);
  };

  // Position from the top: 100 → 0%, 0 → 100%.
  const handleTopPct = score !== null ? 100 - score : null;

  return (
    <div className="flex items-stretch justify-center gap-3">
      <ArcadeCard game={game} size="sm" state={score !== null ? 'win' : 'idle'} />

      <div className="flex flex-1 flex-col">
        <span className="mb-1.5 truncate font-display text-xs font-bold uppercase tracking-wide text-fg">
          {game.title}
        </span>

        <div className="flex flex-1 items-stretch justify-center gap-1.5">
          {/* Scale labels */}
          <div className="flex flex-col justify-between py-0 text-right">
            {SCALE_MARKS.map((mark) => (
              <span
                key={mark}
                aria-hidden
                className="font-mono text-[0.55rem] font-bold leading-none tabular-nums text-muted/40"
              >
                {mark}
              </span>
            ))}
          </div>

          {/* Meter bar */}
          <div
            ref={barRef}
            role="slider"
            aria-label={`Rate ${game.title}`}
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={score ?? undefined}
            aria-valuetext={score !== null ? String(score) : 'unrated'}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            className="relative min-h-[8.5rem] w-8 cursor-pointer touch-none rounded-hardware border border-border"
            style={{
              background:
                'linear-gradient(to bottom, rgb(var(--color-teal)), rgb(var(--color-accent)) 50%, rgb(var(--color-coin)))',
            }}
          >
            {/* Quartile gridlines */}
            {[25, 50, 75].map((mark) => (
              <span
                key={mark}
                aria-hidden
                className="pointer-events-none absolute left-0 right-0 h-px bg-bg/30"
                style={{ top: `${100 - mark}%` }}
              />
            ))}

            {/* Active fill from the top down to the handle */}
            {handleTopPct !== null && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-0 right-0 top-0 bg-bg/15"
                style={{ height: `${handleTopPct}%` }}
              />
            )}

            {/* Handle */}
            {handleTopPct !== null && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute left-1/2 z-10 flex h-7 w-9 -translate-x-1/2 items-center justify-center rounded-hardware border border-border bg-bg font-display text-xs font-black tabular-nums text-fg shadow-soft"
                animate={{ top: `${handleTopPct}%`, y: '-50%' }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 30 }}
              >
                {score}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Minigame 11 — "Where do these land for you?" Shows 3–5 covers, each beside its own vertical
 * 0–100 feel-meter. Drag (or tap) a meter to set how strongly the game lands; the engine nudges
 * each game's ELO toward the rating interpolated from that 0–100 score via a soft `vibe` outcome
 * (one per game). The scale is deliberately low-key — no S–F letters — so the player rates by feel
 * rather than explicitly sorting into tiers.
 *
 * Mouse + touch are unified through Pointer Events (`touch-none` prevents scroll hijacking on
 * mobile). No keyboard dependency; ARIA labels carry screen-reader context.
 */
export function VibeMeter({ games, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [scores, setScores] = useState<Record<number, number | null>>({});

  if (games.length === 0) return null;

  const ratedCount = games.filter((g) => scores[g.igdbId] != null).length;
  const allRated = ratedCount === games.length;

  const setScore = (gameId: number, score: number) => {
    setScores((prev) => ({ ...prev, [gameId]: score }));
  };

  const lockIn = () => {
    if (!allRated) return;
    playSound('success');
    const outcomes = games.map((g) => ({
      type: 'vibe' as const,
      gameId: g.igdbId,
      score: scores[g.igdbId] as number,
    }));
    complete(outcomes);
  };

  return (
    <div className="flex flex-col items-center">
      <header className="mb-6 text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.28em] text-accent">Vibe-meter</p>
        <h2 className="font-display text-3xl font-black uppercase tracking-[0.02em] text-fg sm:text-4xl">
          Where do these land?
        </h2>
        <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted">
          Drag each meter — 100 is a must-play, 0 is a pass
        </p>
      </header>

      <div className="grid w-full max-w-2xl grid-cols-1 justify-items-center gap-4 sm:grid-cols-2">
        {games.map((g) => (
          <div key={g.igdbId} className="w-full max-w-xs">
            <VibeRow
              game={g}
              score={scores[g.igdbId] ?? null}
              onChange={(s) => setScore(g.igdbId, s)}
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          {ratedCount} / {games.length} rated
        </span>
        <Button onClick={lockIn} disabled={!allRated}>
          Lock in vibes →
        </Button>
      </div>
    </div>
  );
}
