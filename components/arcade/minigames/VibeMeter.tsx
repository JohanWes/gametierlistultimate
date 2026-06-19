'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useRef, useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import type { Tier } from '@/lib/ranking';
import { clamp, cn } from '@/lib/utils';

import { Button } from '../../ui/Button';
import { useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard } from './ArcadeCard';

const TIERS: Tier[] = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];

const TIER_TEXT: Record<Tier, string> = {
  S: 'text-teal',
  A: 'text-teal',
  B: 'text-accent',
  C: 'text-accent',
  D: 'text-coin',
  E: 'text-coin',
  F: 'text-coin',
};

function tierFromPosition(pos: number): Tier {
  const idx = Math.min(TIERS.length - 1, Math.floor(pos * TIERS.length));
  return TIERS[idx];
}

function positionForTier(tier: Tier): number {
  const idx = TIERS.indexOf(tier);
  return (idx + 0.5) / TIERS.length;
}

function VibeRow({
  game,
  tier,
  onChange,
}: {
  game: Game;
  tier: Tier | null;
  onChange: (tier: Tier) => void;
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

  const update = (newTier: Tier) => {
    if (newTier !== tier) {
      playSound('blip');
      onChange(newTier);
    }
  };

  const handleDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    update(tierFromPosition(positionFromEvent(e.clientY)));
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    update(tierFromPosition(positionFromEvent(e.clientY)));
  };

  const handleUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget?.releasePointerCapture?.(e.pointerId);
  };

  const handleTopPct = tier !== null ? positionForTier(tier) * 100 : null;

  return (
    <div className="flex items-stretch justify-center gap-3">
      <ArcadeCard game={game} size="sm" state={tier ? 'win' : 'idle'} />

      <div className="flex flex-1 flex-col">
        <span className="mb-1.5 truncate font-display text-xs font-bold uppercase tracking-wide text-fg">
          {game.title}
        </span>

        <div className="flex flex-1 items-stretch justify-center gap-1.5">
          {/* Tier labels */}
          <div className="flex flex-col justify-between py-0 text-right">
            {TIERS.map((t) => (
              <span
                key={t}
                aria-hidden
                className={cn(
                  'font-mono text-[0.6rem] font-bold leading-none transition-colors',
                  tier === t ? TIER_TEXT[t] : 'text-muted/40',
                )}
              >
                {t}
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
            aria-valuemax={6}
            aria-valuenow={tier ? TIERS.indexOf(tier) : undefined}
            aria-valuetext={tier ?? 'unrated'}
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
            {/* Tier segment dividers */}
            {TIERS.slice(1).map((_, i) => (
              <span
                key={i}
                aria-hidden
                className="pointer-events-none absolute left-0 right-0 h-px bg-bg/30"
                style={{ top: `${((i + 1) / TIERS.length) * 100}%` }}
              />
            ))}

            {/* Handle */}
            {handleTopPct !== null && (
              <motion.div
                aria-hidden
                className={cn(
                  'pointer-events-none absolute left-1/2 z-10 flex h-7 w-9 -translate-x-1/2 items-center justify-center rounded-hardware border border-border bg-bg font-display text-xs font-black shadow-soft',
                  TIER_TEXT[tier as Tier],
                )}
                animate={{ top: `${handleTopPct}%`, y: '-50%' }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 30 }}
              >
                {tier}
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
 * S–F tier meter. Drag (or tap) a meter to place the game in a tier; the engine nudges each game's
 * ELO toward that tier's representative band via a soft `vibe` outcome (one per game).
 *
 * Mouse + touch are unified through Pointer Events (`touch-none` prevents scroll hijacking on
 * mobile). No keyboard dependency; ARIA labels carry screen-reader context.
 */
export function VibeMeter({ games, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [tiers, setTiers] = useState<Record<number, Tier | null>>({});

  if (games.length === 0) return null;

  const ratedCount = games.filter((g) => tiers[g.igdbId] != null).length;
  const allRated = ratedCount === games.length;

  const setTier = (gameId: number, tier: Tier) => {
    setTiers((prev) => ({ ...prev, [gameId]: tier }));
  };

  const lockIn = () => {
    if (!allRated) return;
    playSound('success');
    const outcomes = games.map((g) => ({
      type: 'vibe' as const,
      gameId: g.igdbId,
      tier: tiers[g.igdbId] as Tier,
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
          Drag each meter — top is S, bottom is F
        </p>
      </header>

      <div className="grid w-full max-w-2xl grid-cols-1 justify-items-center gap-4 sm:grid-cols-2">
        {games.map((g) => (
          <div key={g.igdbId} className="w-full max-w-xs">
            <VibeRow
              game={g}
              tier={tiers[g.igdbId] ?? null}
              onChange={(t) => setTier(g.igdbId, t)}
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
