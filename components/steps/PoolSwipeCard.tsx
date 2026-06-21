'use client';

import {
  animate,
  AnimatePresence,
  motion,
  type PanInfo,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import { useRef } from 'react';

import type { Game } from '@/lib/games/types';
import { type PoolDecision, STATUS_OPTIONS, usePoolDecision } from '@/lib/pool-decision';
import { tapProps } from '@/lib/tap';
import { cn } from '@/lib/utils';

import { GameCard } from '../ui/GameCard';

/** Fraction of the card width a swipe must clear to commit a decision. */
const COMMIT_RATIO = 0.28;
/** Floor for the commit distance so very narrow cards still need a deliberate swipe. */
const MIN_COMMIT = 88;
/** A fast flick commits even if it didn't travel far. */
const COMMIT_VELOCITY = 520;

export interface PoolSwipeCardProps {
  game: Game;
  /** Injected RNG in [0, 1); defaults to Math.random. */
  random?: () => number;
  onDecide: (action: PoolDecision) => void;
}

/**
 * Mobile swipe deck card. The boxart is the whole decision surface: drag right (or tap ✓) to add
 * the game, drag left (or tap ✕) to pass. A "PLAYED IT" / "PASS" stamp fades in with the drag.
 * Crossing the commit threshold flings the card off-screen and then the decision runs — except on
 * the occasional spotlight roll, where the played-status sheet opens immediately while the card
 * flings, and the include commits once a status is picked.
 *
 * Dragging uses Framer Motion's built-in pointer/touch handling (it sets the right `touch-action`
 * and pointer capture) so a horizontal swipe is never mistaken for a page scroll.
 */
export function PoolSwipeCard({ game, random = Math.random, onDecide }: PoolSwipeCardProps) {
  const reduce = useReducedMotion();
  const { picking, playedRollHits, reject, chooseStatus } = usePoolDecision({
    game,
    random,
    onDecide,
  });
  const hasCover = game.hasCover && !!game.coverUrl;

  const cardRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 0, 260], [-13, 0, 13]);
  const playedOpacity = useTransform(x, [24, 130], [0, 1]);
  const passOpacity = useTransform(x, [-130, -24], [1, 0]);

  const flyAway = (dir: 1 | -1, after?: () => void) => {
    if (reduce) {
      after?.();
      return;
    }
    const width = typeof window === 'undefined' ? 600 : window.innerWidth;
    animate(x, dir * width * 1.3, {
      duration: 0.3,
      ease: [0.32, 0, 0.67, 0],
      onComplete: after,
    });
  };

  const springBack = () => {
    animate(x, 0, { type: 'spring', stiffness: 520, damping: 38 });
  };

  const commitPlayed = () => {
    // Roll first so a spotlight sheet opens the instant the swipe lands — no wait on the fling.
    if (playedRollHits()) {
      flyAway(1);
      return;
    }
    flyAway(1, () => chooseStatus('finished'));
  };

  const commitReject = () => {
    flyAway(-1, reject);
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const width = cardRef.current?.offsetWidth ?? 320;
    const threshold = Math.max(MIN_COMMIT, width * COMMIT_RATIO);
    if (info.offset.x > threshold || info.velocity.x > COMMIT_VELOCITY) commitPlayed();
    else if (info.offset.x < -threshold || info.velocity.x < -COMMIT_VELOCITY) commitReject();
    else springBack();
  };

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <motion.div
        ref={cardRef}
        drag={reduce || picking ? false : 'x'}
        dragSnapToOrigin={false}
        dragMomentum={false}
        dragElastic={0.6}
        onDragEnd={handleDragEnd}
        className={cn(
          'relative z-10 w-[min(82vw,20rem)] select-none overflow-hidden rounded-card border-2 border-border bg-surface shadow-lift',
          reduce || picking ? undefined : 'cursor-grab touch-pan-y active:cursor-grabbing',
        )}
        style={reduce ? undefined : { x, rotate }}
      >
        <GameCard
          game={game}
          showTitle={false}
          size="lg"
          className="pointer-events-none w-full rounded-none border-0 shadow-none"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[34%] bg-gradient-to-t from-black/95 via-black/70 via-45% to-transparent"
        />
        {hasCover ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 px-4 text-center">
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-fg drop-shadow-[0_2px_3px_rgb(0_0_0/0.95)]">
              {game.title}
            </p>
          </div>
        ) : null}

        {reduce ? null : (
          <>
            <motion.span
              aria-hidden
              style={{ opacity: playedOpacity }}
              className="pointer-events-none absolute left-4 top-4 z-30 -rotate-12 rounded-tile border-[3px] border-tier-c bg-black/40 px-3 py-1 font-display text-2xl font-black uppercase tracking-[0.08em] text-tier-c"
            >
              Played it
            </motion.span>
            <motion.span
              aria-hidden
              style={{ opacity: passOpacity }}
              className="pointer-events-none absolute right-4 top-4 z-30 rotate-12 rounded-tile border-[3px] border-coin bg-black/40 px-3 py-1 font-display text-2xl font-black uppercase tracking-[0.08em] text-coin"
            >
              Pass
            </motion.span>
          </>
        )}
      </motion.div>

      {picking ? null : (
        <div className="flex items-start gap-10">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              aria-label="Pass"
              {...tapProps(commitReject)}
              className="flex h-16 w-16 select-none items-center justify-center rounded-hardware border-2 border-coin/70 bg-surface text-3xl leading-none text-coin shadow-cabinet transition-colors duration-150 hover:bg-coin/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coin"
            >
              <span aria-hidden>✕</span>
            </button>
            <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted">Pass</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              aria-label="Played it"
              {...tapProps(commitPlayed)}
              className="flex h-16 w-16 select-none items-center justify-center rounded-hardware border-2 border-teal/70 bg-surface text-3xl leading-none text-tier-c shadow-cabinet transition-colors duration-150 hover:bg-teal/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            >
              <span aria-hidden>✓</span>
            </button>
            <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted">Played it</span>
          </div>
        </div>
      )}

      <AnimatePresence>
        {picking ? (
          <>
            <motion.div
              key="spotlight-backdrop"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              key="spotlight-sheet"
              initial={reduce ? false : { y: '100%' }}
              animate={{ y: 0 }}
              exit={reduce ? { opacity: 0 } : { y: '100%' }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2.5 rounded-t-card border-t-2 border-accent/50 bg-panel px-5 pb-8 pt-5 shadow-[0_-18px_40px_-24px_rgb(0_0_0/0.9)]"
            >
              <span className="self-center rounded-hardware border border-accent/70 bg-black/70 px-3 py-0.5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.18em] text-accent shadow-soft">
                ★ Spotlight
              </span>
              <p className="text-center font-mono text-[0.7rem] uppercase tracking-[0.18em] text-teal">
                How much did you play it?
              </p>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.status}
                  type="button"
                  {...tapProps(() => chooseStatus(opt.status))}
                  className={cn(
                    'select-none rounded-tile border px-4 py-3 text-base font-semibold shadow-soft transition-colors duration-150 focus-visible:outline-none',
                    opt.status === 'played-a-lot'
                      ? 'border-accent/70 bg-accent/12 text-accent hover:bg-accent/20'
                      : 'border-border bg-surface-elevated text-fg hover:border-teal/60',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
