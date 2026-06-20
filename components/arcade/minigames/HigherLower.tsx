'use client';

import { motion } from 'framer-motion';
import { useRef, useState } from 'react';

import { zoneIndexAtPagePoint } from '@/components/steps/result/dnd';
import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import type { RankingOutcome } from '@/lib/ranking';
import { cn } from '@/lib/utils';

import { Button } from '../../ui/Button';
import { useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard, type CardState } from './ArcadeCard';
import { DraggableArcadeCard } from './DraggableArcadeCard';
import { MinigameHeader } from './MinigameHeader';

/**
 * The scale's bands, left (worst) → right (best). The band *index* is the ranking signal: a higher
 * index means a better game. Three plain words replace the old `++/=/--` shorthand so the axis
 * explains itself; the horizontal layout keeps the whole minigame on-screen with no scrolling.
 */
const BANDS = [
  { key: 'bad', label: 'Bad', accent: 'coin' },
  { key: 'mid', label: 'Mid', accent: 'accent' },
  { key: 'great', label: 'Great', accent: 'teal' },
] as const;

const ACCENT_TEXT: Record<string, string> = {
  teal: 'text-teal',
  accent: 'text-accent',
  coin: 'text-coin',
};
const ACCENT_BAR: Record<string, string> = {
  teal: 'bg-teal',
  accent: 'bg-accent',
  coin: 'bg-coin',
};

const STRONG_WEIGHT = 1.35;
/** Band gap at/above which a win is treated as a landslide (heavier ELO move). */
const STRONG_GAP = 2;

/**
 * Pure placement → outcome mapping. The challenger/anchor identity only fixes the `about-equal`
 * gameIds ordering (to stay consistent with the rest of the arcade); the *winner* is whoever lands
 * in the better (higher-index) band. Same band = about-equal; ≥ `STRONG_GAP` bands apart = weighted.
 * With three bands the only landslide is Bad vs Great.
 */
export function outcomeForBands(
  anchor: Game,
  challenger: Game,
  anchorBand: number,
  challengerBand: number,
): RankingOutcome {
  if (anchorBand === challengerBand) {
    return { type: 'about-equal', gameIds: [challenger.igdbId, anchor.igdbId] };
  }
  const gap = Math.abs(anchorBand - challengerBand);
  const challengerWins = challengerBand > anchorBand;
  const winner = challengerWins ? challenger : anchor;
  const loser = challengerWins ? anchor : challenger;
  return {
    type: 'pairwise',
    winnerId: winner.igdbId,
    loserId: loser.igdbId,
    ...(gap >= STRONG_GAP ? { weight: STRONG_WEIGHT } : {}),
  };
}

/**
 * Minigame 6 — "The scale." A horizontal ruler with three plainly-worded bands (Bad → Mid → Great,
 * worst on the left). The player physically drags both covers onto the band they belong in; two
 * covers in the same band sit next to each other.
 *
 * The relative placement drives the outcome — same band = about-equal, otherwise the cover in the
 * better band wins, and a landslide (Bad vs Great) carries a stronger weight. A live readout and
 * per-cover win/lose/equal glow make "what means what" obvious before committing. Mouse + touch via
 * Pointer Events; tap-to-place fallback keeps it usable without precision dragging or a keyboard.
 */
export function HigherLower({ games, anchorId, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [bands, setBands] = useState<Record<number, number>>({});
  const [picked, setPicked] = useState<number | null>(null);
  const [pulsed, setPulsed] = useState<number | null>(null);
  const zoneRefs = useRef<(HTMLDivElement | null)[]>([]);

  if (games.length < 2) return null;
  const anchor = games.find((g) => g.igdbId === anchorId) ?? games[0];
  const challenger = games.find((g) => g.igdbId !== anchor.igdbId) ?? games[1];
  const pair: [Game, Game] = [anchor, challenger];

  const placedCount = Object.keys(bands).length;
  const allPlaced = placedCount === pair.length;

  const place = (gameId: number, band: number) => {
    playSound('click');
    setBands((prev) => ({ ...prev, [gameId]: band }));
    setPicked(null);
    setPulsed(band);
    window.setTimeout(() => setPulsed((b) => (b === band ? null : b)), 360);
  };

  const unplace = (gameId: number) => {
    playSound('blip');
    setBands((prev) => {
      const next = { ...prev };
      delete next[gameId];
      return next;
    });
  };

  const handleDropAt = (gameId: number, point: { x: number; y: number }): boolean => {
    const idx = zoneIndexAtPagePoint(point, zoneRefs.current);
    if (idx < 0) return false;
    place(gameId, idx);
    return true;
  };

  const tapCard = (gameId: number) => {
    playSound('blip');
    setPicked((cur) => (cur === gameId ? null : gameId));
  };

  const tapBand = (band: number) => {
    if (picked === null) return;
    place(picked, band);
  };

  const lockIn = () => {
    if (!allPlaced) return;
    playSound('success');
    complete([outcomeForBands(anchor, challenger, bands[anchor.igdbId], bands[challenger.igdbId])]);
  };

  const skip = () => {
    playSound('click');
    complete([{ type: 'skip', gameIds: [challenger.igdbId, anchor.igdbId] }]);
  };

  const tray = pair.filter((g) => bands[g.igdbId] === undefined);
  const readout = readoutFor(pair, bands);
  const liveState = (g: Game): CardState => {
    if (!allPlaced) return 'idle';
    const outcome = outcomeForBands(anchor, challenger, bands[anchor.igdbId], bands[challenger.igdbId]);
    if (outcome.type === 'about-equal') return 'equal';
    if (outcome.type === 'pairwise') return outcome.winnerId === g.igdbId ? 'win' : 'lose';
    return 'idle';
  };

  return (
    <div className="flex flex-col items-center">
      <MinigameHeader
        tone="teal"
        eyebrow="The scale"
        title="Where do these land?"
        hint="Drag both covers onto the scale — left is bad, right is great"
      />

      {/* The scale: 3 drop zones in a row, with the ruler bar + labels directly beneath. */}
      <div className="w-full max-w-2xl">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          {BANDS.map((band, i) => {
            const contents = pair.filter((g) => bands[g.igdbId] === i);
            return (
              <motion.div
                key={band.key}
                ref={(el) => {
                  zoneRefs.current[i] = el;
                }}
                role="button"
                tabIndex={0}
                aria-label={`${band.label} band`}
                onClick={() => tapBand(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    tapBand(i);
                  }
                }}
                animate={pulsed === i ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                transition={{ duration: 0.36 }}
                className={cn(
                  'flex min-h-[156px] flex-col items-center justify-center rounded-tile border p-2 transition-colors',
                  contents.length > 0
                    ? 'border-border/70 bg-surface/15'
                    : 'border-dashed border-border/40',
                  picked !== null && 'cursor-pointer border-solid border-teal/50 bg-surface/25',
                )}
              >
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {contents.map((g) => (
                    <motion.button
                      key={g.igdbId}
                      type="button"
                      layout
                      aria-label={`Remove ${g.title} from ${band.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        unplace(g.igdbId);
                      }}
                      className="rounded-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <ArcadeCard game={g} size="sm" state={liveState(g)} />
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Ruler bar: 3 colored segments form one continuous scale, labels under each. */}
        <div className="mt-2 grid grid-cols-3 gap-2.5 sm:gap-4">
          {BANDS.map((band) => (
            <div key={band.key} className="flex flex-col items-center">
              <div className="flex w-full items-center">
                <span aria-hidden className={cn('h-1.5 flex-1 rounded-full', ACCENT_BAR[band.accent])} />
              </div>
              <span
                className={cn(
                  'mt-1.5 font-display text-sm font-black uppercase tracking-[0.06em]',
                  ACCENT_TEXT[band.accent],
                )}
              >
                {band.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Live readout — tells the player what their placement means right now. */}
      <p className="mt-4 min-h-5 text-center font-display text-sm font-bold uppercase tracking-[0.06em] text-fg">
        {readout}
      </p>

      {/* Tray of unplaced covers (or a nudge once both are down). */}
      <div className="mt-4 flex min-h-[120px] w-full max-w-2xl flex-wrap items-center justify-center gap-3 border-t border-border pt-4">
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
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted">
            Both placed — lock it in or tap a cover to redo
          </span>
        )}
      </div>

      {/* Persistent actions: lock in the placement, or skip the round. */}
      <div className="mt-4 flex items-center justify-center gap-2.5">
        <Button onClick={lockIn} disabled={!allPlaced}>
          Lock in placement →
        </Button>
        <Button variant="ghost" onClick={skip}>
          Skip
        </Button>
      </div>
    </div>
  );
}

/** Build the live "what this means" line from the current placements. */
function readoutFor([anchor, challenger]: [Game, Game], bands: Record<number, number>): string {
  const a = bands[anchor.igdbId];
  const c = bands[challenger.igdbId];
  if (a === undefined || c === undefined) {
    const next = a === undefined ? anchor : challenger;
    return `Now place ${next.title}`;
  }
  if (a === c) return `About even — both ${BANDS[a].label.toLowerCase()}`;
  const gap = Math.abs(a - c);
  const winner = c > a ? challenger : anchor;
  const loser = c > a ? anchor : challenger;
  const strength = gap >= STRONG_GAP ? ' wins big — ' : ' wins — ';
  return `${winner.title}${strength}${BANDS[bands[winner.igdbId]].label} vs ${BANDS[bands[loser.igdbId]].label}`;
}
