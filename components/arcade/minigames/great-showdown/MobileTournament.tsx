'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import type { ShowdownViewProps } from '../GreatShowdown';
import { tapProps } from '../../shared';
import { ArcadeCard, type CardState } from '../ArcadeCard';
import {
  boutsForRound,
  ROUND_PLAN,
  roundHeading,
  type ShowdownRound,
} from './tournament';

/** Auto-dismiss timing for the orientation preview and the chapter title cards. */
const PREVIEW_MS = 1600;
const CHAPTER_MS = 480;

/**
 * Mobile presentation: a short orientation preview, then each bout full-screen as a 1v1 with a
 * round + pip header, plus a chapter card before the semifinals and the finale, and a champion
 * screen at the end. The whole tree never shows at once — codex: "mobile = cinematic sequence."
 */
export function MobileTournament({
  gameById,
  state,
  active,
  pendingWinnerId,
  champion,
  onPick,
}: ShowdownViewProps) {
  const reduce = useReducedMotion();
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    if (!showPreview) return;
    const t = window.setTimeout(() => setShowPreview(false), PREVIEW_MS);
    return () => window.clearTimeout(t);
  }, [showPreview]);

  if (showPreview) {
    return <Preview seedIds={state.seededIds} gameById={gameById} onSkip={() => setShowPreview(false)} />;
  }

  if (champion !== null && !active) {
    return <ChampionScreen state={state} champion={champion} gameById={gameById} />;
  }

  if (!active) return null;

  const a = gameById.get(active.a);
  const b = gameById.get(active.b);
  if (!a || !b) return null;

  const stateFor = (id: number): CardState =>
    pendingWinnerId === null ? 'idle' : pendingWinnerId === id ? 'win' : 'lose';

  const { title, position } = roundHeading(state);

  return (
    <div className="relative flex flex-col items-center">
      <ChapterCard round={active.round} firstOfRound={position.startsWith('1')} />

      <PipRail state={state} />

      <p className="mb-1 mt-3 font-display text-xl font-black uppercase tracking-[0.04em] text-fg">
        {active.round === 'finale' ? 'The finale' : title}
        {position ? <span className="ml-2 text-muted">{position}</span> : null}
      </p>

      <div className="grid w-full max-w-2xl grid-cols-[1fr_auto_1fr] items-center gap-3">
        <motion.div
          key={`${active.id}-a`}
          className="flex justify-end"
          initial={reduce ? false : { x: -36, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        >
          <ArcadeCard game={a} size="duo" state={stateFor(a.igdbId)} onSelect={() => onPick(a.igdbId)} />
        </motion.div>

        <Vs ignite={active.round === 'finale'} settled={pendingWinnerId !== null} />

        <motion.div
          key={`${active.id}-b`}
          className="flex justify-start"
          initial={reduce ? false : { x: 36, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        >
          <ArcadeCard game={b} size="duo" state={stateFor(b.igdbId)} onSelect={() => onPick(b.igdbId)} />
        </motion.div>
      </div>

      <p className="mt-4 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted">
        Tap the winner
      </p>
    </div>
  );
}

function Preview({
  seedIds,
  gameById,
  onSkip,
}: {
  seedIds: number[];
  gameById: ShowdownViewProps['gameById'];
  onSkip: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      {...tapProps(onSkip)}
      className="flex w-full flex-col items-center gap-4 rounded-card focus-visible:outline-none"
    >
      <header className="text-center">
        <p className="mb-1 font-mono text-[0.68rem] uppercase tracking-[0.24em] text-accent">
          The Great Showdown
        </p>
        <h2 className="font-display text-2xl font-black uppercase tracking-[0.02em] text-fg">
          Eight enter. One is crowned.
        </h2>
      </header>

      <div className="grid grid-cols-4 gap-2">
        {seedIds.map((id, i) => {
          const game = gameById.get(id);
          if (!game) return null;
          return (
            <motion.div
              key={id}
              initial={reduce ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: reduce ? 0 : i * 0.06, type: 'spring', stiffness: 360, damping: 24 }}
            >
              <ArcadeCard game={game} size="zone" />
            </motion.div>
          );
        })}
      </div>

      <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted/80">
        Tap to begin
      </span>
    </button>
  );
}

function PipRail({ state }: { state: ShowdownViewProps['state'] }) {
  const activeRound = state.bouts[state.activeIndex]?.round;
  return (
    <div className="flex items-center gap-2.5">
      {ROUND_PLAN.map(({ round, count, short }, idx) => {
        const resolved = boutsForRound(state, round).filter((b) => b.winnerId !== null).length;
        return (
          <div key={round} className="flex items-center gap-2.5">
            {idx > 0 ? <span aria-hidden className="text-muted/40">·</span> : null}
            <span
              className={cn(
                'font-mono text-[0.55rem] uppercase tracking-[0.14em]',
                round === activeRound ? 'text-teal' : 'text-muted/60',
              )}
            >
              {short}
            </span>
            <span className="flex gap-1">
              {Array.from({ length: count }).map((_, i) => {
                const filled = i < resolved;
                const isActive = round === activeRound && i === resolved;
                return (
                  <span
                    key={i}
                    className={cn(
                      'h-1.5 w-1.5 rounded-full transition-colors',
                      filled ? 'bg-accent' : isActive ? 'bg-teal' : 'bg-border',
                      isActive && 'animate-pulse',
                    )}
                  />
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Vs({ ignite, settled }: { ignite: boolean; settled: boolean }) {
  return (
    <div className="relative flex h-full min-h-[6rem] w-9 items-center justify-center">
      <span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'linear-gradient(to bottom, rgb(var(--color-teal)), rgb(var(--color-accent)), rgb(var(--color-coin)))',
          opacity: settled ? 0.4 : ignite ? 1 : 0.8,
        }}
      />
      <span
        className={cn(
          'relative z-10 flex h-9 w-9 rotate-[-8deg] items-center justify-center rounded-tile border border-border bg-bg font-display text-sm font-black uppercase text-fg shadow-cabinet',
        )}
      >
        VS
      </span>
    </div>
  );
}

function ChapterCard({ round, firstOfRound }: { round: ShowdownRound; firstOfRound: boolean }) {
  const reduce = useReducedMotion();
  const [label, setLabel] = useState<string | null>(null);
  const shown = useRef<ShowdownRound | null>(null);

  useEffect(() => {
    // A quick chapter wipe only when entering the semifinals or the finale.
    if (!firstOfRound) return;
    if (round !== 'SF' && round !== 'finale') return;
    if (shown.current === round) return;
    shown.current = round;
    setLabel(round === 'finale' ? 'The finale' : 'Semifinals');
    const t = window.setTimeout(() => setLabel(null), CHAPTER_MS);
    return () => window.clearTimeout(t);
  }, [round, firstOfRound]);

  return (
    <AnimatePresence>
      {label ? (
        <motion.div
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-bg/80"
          initial={reduce ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.span
            className="font-display text-3xl font-black uppercase tracking-[0.06em] text-accent"
            initial={reduce ? false : { scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            {label}
          </motion.span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ChampionScreen({
  state,
  champion,
  gameById,
}: {
  state: ShowdownViewProps['state'];
  champion: number;
  gameById: ShowdownViewProps['gameById'];
}) {
  const reduce = useReducedMotion();
  const game = gameById.get(champion);
  if (!game) return null;
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-coin">Champion</p>
      <motion.div
        initial={reduce ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      >
        <ArcadeCard game={game} size="solo" state="win" badge="♛" />
      </motion.div>
      <p className="font-display text-xl font-black uppercase tracking-[0.04em] text-teal">
        {game.title}
      </p>
      <div className="flex gap-1.5">
        {state.seededIds.map((id) => (
          <span
            key={id}
            className={cn(
              'h-1.5 w-4 rounded-full',
              id === champion ? 'bg-coin' : 'bg-border',
            )}
          />
        ))}
      </div>
    </div>
  );
}
