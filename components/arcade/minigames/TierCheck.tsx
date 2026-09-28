'use client';

import { useState } from 'react';

import type { Game } from '@/lib/games/types';
import { TIER_ORDER, tierScore, type Tier } from '@/lib/ranking';
import { playSound } from '@/lib/sound';
import { clamp, cn } from '@/lib/utils';

import { Button } from '../../ui/Button';
import { ArrowDownIcon, ArrowUpIcon } from '../../ui/icons';
import { TIER_BG } from '../../ui/Row';
import { tapProps, useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard } from './ArcadeCard';

const TIER_GLOW: Record<Tier, string> = {
  S: 'rgb(var(--tier-s) / 0.6)',
  A: 'rgb(var(--tier-a) / 0.6)',
  B: 'rgb(var(--tier-b) / 0.6)',
  C: 'rgb(var(--tier-c) / 0.6)',
  D: 'rgb(var(--tier-d) / 0.6)',
  E: 'rgb(var(--tier-e) / 0.6)',
  F: 'rgb(var(--tier-f) / 0.6)',
};

function shiftTier(tier: Tier, steps: number): Tier {
  const idx = clamp(TIER_ORDER.indexOf(tier) + steps, 0, TIER_ORDER.length - 1);
  return TIER_ORDER[idx];
}

/**
 * Minigame — "Tier Check." A sneak peek of one row of the player's board: the tier the engine is
 * least sure about, laid out like the reveal's tier row. Anything that's off gets nudged up or
 * down; everything left alone is confirmed. One `vibe` outcome per game pins each one to its
 * (possibly nudged) tier, so a single "Looks right" banks confidence for the whole row.
 */
export function TierCheck({ games, boundary = 'B', onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [shifts, setShifts] = useState<Record<number, number>>({});

  if (games.length === 0) return null;

  const tierOf = (id: number) => shiftTier(boundary, shifts[id] ?? 0);
  const moved = games.some((g) => tierOf(g.igdbId) !== boundary);

  const nudge = (id: number, steps: number) => {
    playSound('click');
    setShifts((prev) => {
      const next = TIER_ORDER.indexOf(shiftTier(boundary, (prev[id] ?? 0) + steps));
      return { ...prev, [id]: next - TIER_ORDER.indexOf(boundary) };
    });
  };

  const lockIn = () => {
    playSound('success');
    complete(
      games.map((g) => ({
        type: 'vibe' as const,
        gameId: g.igdbId,
        score: tierScore(tierOf(g.igdbId)),
      })),
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center">
      <header className="mb-3 text-center sm:mb-5">
        <h2 className="font-display text-xl font-black uppercase tracking-[0.02em] text-fg sm:text-2xl">
          Is this your {boundary} tier?
        </h2>
        <p className="mt-1 text-sm font-medium text-fg/80 sm:mt-1.5">
          Nudge anything that’s off. The rest stays put.
        </p>
      </header>

      {/* Echoes a row of the reveal board: tier stripe on the left, the covers on the right. */}
      <div className="flex w-full items-stretch overflow-hidden rounded-card border border-border bg-surface shadow-cabinet">
        <div
          className={cn('flex w-8 shrink-0 items-center justify-center sm:w-16', TIER_BG[boundary])}
        >
          <span className="font-display text-2xl font-extrabold text-black/85 sm:text-5xl">
            {boundary}
          </span>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-3 justify-items-center gap-x-1.5 gap-y-3 p-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-4 sm:p-4">
          {games.map((g) => (
            <CheckCard
              key={g.igdbId}
              game={g}
              tier={tierOf(g.igdbId)}
              changed={tierOf(g.igdbId) !== boundary}
              onNudge={(steps) => nudge(g.igdbId, steps)}
            />
          ))}
        </div>
      </div>

      <Button onClick={lockIn} className="mt-4 w-full sm:mt-6 sm:w-auto sm:min-w-56">
        {moved ? 'Lock it in →' : 'Looks right →'}
      </Button>
    </div>
  );
}

function CheckCard({
  game,
  tier,
  changed,
  onNudge,
}: {
  game: Game;
  tier: Tier;
  changed: boolean;
  onNudge: (steps: number) => void;
}) {
  return (
    <div className="flex w-[var(--cover-check)] flex-col gap-1.5">
      <div className="relative">
        <ArcadeCard
          game={game}
          size="check"
          state={changed ? 'win' : 'idle'}
          glowColor={changed ? TIER_GLOW[tier] : undefined}
        />
        {changed ? (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute -right-1.5 -top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-hardware font-display text-base font-black text-black/85 shadow-soft',
              TIER_BG[tier],
            )}
          >
            {tier}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-1">
        <NudgeButton
          label={`Move ${game.title} up a tier`}
          disabled={tier === 'S'}
          onTap={() => onNudge(-1)}
        >
          <ArrowUpIcon />
        </NudgeButton>
        <NudgeButton
          label={`Move ${game.title} down a tier`}
          disabled={tier === 'F'}
          onTap={() => onNudge(1)}
        >
          <ArrowDownIcon />
        </NudgeButton>
      </div>
    </div>
  );
}

function NudgeButton({
  label,
  disabled,
  onTap,
  children,
}: {
  label: string;
  disabled: boolean;
  onTap: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      {...tapProps(() => {
        if (!disabled) onTap();
      })}
      className="flex h-9 items-center justify-center rounded-tile border border-border bg-surface-elevated text-fg/85 transition-colors hover:border-teal/70 hover:text-teal active:scale-95 disabled:pointer-events-none disabled:opacity-30 sm:h-10"
    >
      {children}
    </button>
  );
}
