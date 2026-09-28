'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useRef, useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import { clamp, cn, interpolateColor, type ColorStop } from '@/lib/utils';

import { Button } from '../../ui/Button';
import { useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard } from './ArcadeCard';
import { CoverRail } from './CoverRail';
import { MinigameHeader } from './MinigameHeader';

/** Visible tick labels down the meter (top → bottom). */
const SCORE_TICKS = [100, 75, 50, 25, 0];

/** Internal segment dividers between ticks, as percentage offsets from the top. */
const TICK_DIVIDERS = [25, 50, 75];

/** Pointer position (0 top → 1 bottom) → 0-100 score (100 top → 0 bottom). */
function scoreFromPosition(pos: number): number {
  return Math.round((1 - clamp(pos, 0, 1)) * 100);
}

/** 0-100 score → pointer position (0 top → 1 bottom). */
function positionFromScore(score: number): number {
  return 1 - clamp(score, 0, 100) / 100;
}

/** Glow color stops: red at 0, yellow at 50, green at 100. */
const COLOR_STOPS: readonly ColorStop[] = [
  { at: 0, rgb: [210, 58, 49] },
  { at: 50, rgb: [255, 213, 92] },
  { at: 100, rgb: [130, 224, 122] },
];

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

  const positionFromEvent = (clientY: number): number => {
    const el = barRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return 0;
    return clamp((clientY - rect.top) / rect.height, 0, 1);
  };

  // Silent update — used while dragging so we don't blip on every tick.
  const update = (newScore: number) => {
    if (newScore !== score) onChange(newScore);
  };

  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    // One blip per drag gesture, on the initial press.
    playSound('blip');
    update(scoreFromPosition(positionFromEvent(e.clientY)));
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    update(scoreFromPosition(positionFromEvent(e.clientY)));
  };

  const handleUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget?.releasePointerCapture?.(e.pointerId);
  };

  return (
    // Cover + meter packed as one unit; the boxart already carries the title, so no label here.
    <div className="flex items-stretch justify-center gap-2">
      <ArcadeCard
        game={game}
        size="zone"
        state={score != null ? 'win' : 'idle'}
        glowColor={score != null ? interpolateColor(COLOR_STOPS, score, 0.55) : undefined}
      />

      {/* Score tick labels */}
      <div className="flex flex-col justify-between py-0 text-right">
        {SCORE_TICKS.map((tick) => (
          <span
            key={tick}
            aria-hidden
            className={cn(
              'font-mono text-[0.6rem] font-bold leading-none tabular-nums transition-colors',
              score !== null && Math.abs(score - tick) <= 12 ? 'text-fg' : 'text-muted/40',
            )}
          >
            {tick}
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
        aria-valuetext={score != null ? `${score} out of 100` : 'unrated'}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        className="relative min-h-[calc(var(--cover-zone)*4/3)] w-8 cursor-pointer touch-none rounded-hardware border border-border"
        style={{
          background:
            'linear-gradient(to bottom, rgb(130 224 122), rgb(255 213 92) 50%, rgb(210 58 49))',
        }}
      >
        {/* Tick segment dividers */}
        {TICK_DIVIDERS.map((pct) => (
          <span
            key={pct}
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 h-px bg-bg/30"
            style={{ top: `${pct}%` }}
          />
        ))}

        {/* Handle */}
        {score !== null && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 z-10 flex h-7 w-9 -translate-x-1/2 items-center justify-center rounded-hardware border border-border bg-bg font-display text-xs font-black tabular-nums shadow-soft"
            style={{ color: interpolateColor(COLOR_STOPS, score) }}
            animate={{ top: `${positionFromScore(score) * 100}%`, y: '-50%' }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 30 }}
          >
            {score}
          </motion.div>
        )}
      </div>
    </div>
  );
}

/**
 * Minigame 11 — "Where do these land for you?" Shows 3–5 covers, each beside its own vertical
 * 0-100 meter. Drag (or tap) a meter to rate the game; the engine nudges each game's ELO toward
 * the tier band that corresponds to the score (100 → S, 0 → F) via a soft `vibe` outcome (one per
 * game). The card backdrop glows green near 100, yellow near 50, red near 0.
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
    complete(
      games.map((g) => ({
        type: 'vibe' as const,
        gameId: g.igdbId,
        score: scores[g.igdbId] as number,
      })),
    );
  };

  return (
    <div className="flex flex-col items-center">
      <MinigameHeader
        title="Where do these land?"
        hint="Drag each meter — top is 100, bottom is 0"
      />

      <CoverRail
        gridClassName="grid w-full max-w-2xl grid-cols-1 justify-items-center gap-4 sm:grid-cols-2"
        itemClassName="w-[min(60vw,16rem)]"
        hint="Swipe to rate each"
      >
        {games.map((g) => (
          <div key={g.igdbId} className="w-full max-w-[16rem]">
            <VibeRow
              game={g}
              score={scores[g.igdbId] ?? null}
              onChange={(s) => setScore(g.igdbId, s)}
            />
          </div>
        ))}
      </CoverRail>

      <div className="mt-6 flex flex-col items-center gap-2">
        <span className="label text-muted">
          {ratedCount} / {games.length} rated
        </span>
        <Button onClick={lockIn} disabled={!allRated}>
          Lock in vibes →
        </Button>
      </div>
    </div>
  );
}
