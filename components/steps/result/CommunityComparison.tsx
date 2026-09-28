'use client';

import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ComparisonResult } from '@/lib/compare-client';
import type { SnapshotGame } from '@/lib/lists-repo';
import { type Tier } from '@/lib/ranking';
import { playSound } from '@/lib/sound';
import { tapProps } from '@/lib/tap';
import { cn, interpolateColor, type ColorStop } from '@/lib/utils';

import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon } from '../../ui/icons';
import { TIER_BG } from '../../ui/Row';

/** Minimal cover/title metadata the outlier rows need. */
type Meta = { title: string; coverUrl: string | null };

interface CommunityComparisonProps {
  /** Owner, pre-publish: the in-flight comparison of the live tiers (started by the reveal). */
  pending?: Promise<ComparisonResult>;
  /** Server-computed comparison for a published list; ready on mount. */
  initialResult?: ComparisonResult;
  /** Cover/title lookup for outliers (owner's live game map). */
  gamesById?: Map<number, Meta>;
  /** Cover/title lookup for outliers (published snapshot games). */
  games?: SnapshotGame[];
  className?: string;
}

/**
 * Score → color across purple (you diverge) → gold (middle) → teal (you align with the crowd).
 * Grounded in the app's palette: teal is the signature "agreement" hue, purple flags individuality.
 */
const COLOR_STOPS: readonly ColorStop[] = [
  { at: 0, rgb: [168, 142, 246] }, // tier-e purple — lone wolf
  { at: 55, rgb: [241, 178, 58] }, // accent gold — middle
  { at: 100, rgb: [67, 202, 190] }, // teal — crowd-certified
];

/** One-word verdict keyed off how much the user lines up with the crowd. */
function verdictFor(percent: number): string {
  if (percent >= 85) return 'Crowd-certified';
  if (percent >= 60) return 'In good company';
  if (percent >= 40) return 'Your own taste';
  return 'Lone wolf';
}

/** Count a number up to `target` on first reveal; jumps instantly under reduced motion. */
function useCountUp(target: number | null): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(target ?? 0);
  useEffect(() => {
    if (target === null) {
      setValue(0);
      return;
    }
    if (reduce) {
      setValue(target);
      return;
    }
    const controls = animate(0, target, {
      duration: 1.1,
      ease: 'easeOut',
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [target, reduce]);
  return target === null ? 0 : value;
}

function TierChip({ tier }: { tier: Tier }) {
  return (
    <span
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded-[3px] font-display text-xs font-extrabold text-black/85 shadow-soft',
        TIER_BG[tier],
      )}
    >
      {tier}
    </span>
  );
}

function Thumb({ meta }: { meta: Meta | undefined }) {
  if (meta?.coverUrl) {
    return (
      // Covers come from many IGDB hosts; a plain img avoids per-domain next/image config.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={meta.coverUrl}
        alt=""
        aria-hidden
        loading="lazy"
        draggable={false}
        className="h-11 w-[2.1rem] shrink-0 rounded-[3px] border border-border object-cover"
      />
    );
  }
  return (
    <span className="flex h-11 w-[2.1rem] shrink-0 items-center justify-center rounded-[3px] border border-border bg-surface-elevated px-0.5 text-center text-[0.5rem] font-bold leading-tight text-fg/80">
      {(meta?.title ?? '—').slice(0, 4)}
    </span>
  );
}

type LoadState = { kind: 'loading' } | { kind: 'ready'; result: ComparisonResult };

/**
 * A low-key "you vs the crowd" plate that auto-loads after the reveal: a count-up percentage and
 * a score-tinted verdict; tapping it opens a compact drawer of "hot takes" — the games where the user most
 * disagrees with the community. Quiet by default, mouse + touch, reduced-motion aware.
 */
export function CommunityComparison({
  pending,
  initialResult,
  gamesById,
  games,
  className,
}: CommunityComparisonProps) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<LoadState>(() =>
    initialResult ? { kind: 'ready', result: initialResult } : { kind: 'loading' },
  );
  const [expanded, setExpanded] = useState(false);
  const announced = useRef(false);

  const metaById = useMemo<Map<number, Meta>>(() => {
    if (gamesById) return gamesById;
    const m = new Map<number, Meta>();
    for (const g of games ?? []) m.set(g.igdbId, { title: g.title, coverUrl: g.coverUrl });
    return m;
  }, [gamesById, games]);

  // A server-provided result (published share page) is ready on mount; the owner's panel keeps its
  // skeleton until the comparison the reveal already started resolves.
  useEffect(() => {
    if (!pending) return;
    let alive = true;
    pending.then((result) => {
      if (alive) setState({ kind: 'ready', result });
    });
    return () => {
      alive = false;
    };
  }, [pending]);

  const ready = state.kind === 'ready' ? state.result : null;
  const hasData = ready?.similarityPercent != null;
  const percent = hasData ? (ready as ComparisonResult).similarityPercent! : null;
  const displayPercent = useCountUp(hasData ? percent : null);

  // One soft cue the first time a real result lands.
  useEffect(() => {
    if (hasData && !announced.current) {
      announced.current = true;
      playSound('reveal');
    }
  }, [hasData]);

  const outliers = ready?.outliers ?? [];
  const hasOutliers = outliers.length > 0;

  const toggle = useCallback(() => {
    if (!hasOutliers) return;
    playSound('blip');
    setExpanded((v) => !v);
  }, [hasOutliers]);

  if (state.kind === 'loading') {
    return (
      <div
        data-testid="comparison-loading"
        aria-hidden
        className={cn(
          'h-[5.25rem] w-full animate-pulse rounded-card border-2 border-border bg-panel/70 sm:w-[15rem]',
          className,
        )}
      />
    );
  }

  // Cold start / transient failure → quiet, honest copy. No fake 0% or invented outliers.
  if (!hasData) {
    return (
      <div
        className={cn(
          'w-full rounded-card border-2 border-dashed border-border/60 bg-panel/60 p-3.5 sm:w-[15rem]',
          className,
        )}
      >
        <p className="label text-teal">Community</p>
        <p className="mt-1 text-xs leading-snug text-muted">
          Not enough lists yet to compare. Check back soon.
        </p>
      </div>
    );
  }

  const p = percent as number;
  const verdict = verdictFor(p);

  return (
    <div className={cn('relative w-full sm:w-[15.5rem]', className)}>
      <motion.button
        type="button"
        {...tapProps(toggle)}
        aria-expanded={hasOutliers ? expanded : undefined}
        aria-label={`You match ${p}% of players${hasOutliers ? '. Show your hot takes.' : ''}`}
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 460, damping: 30 }}
        className={cn(
          'flex w-full items-center gap-3.5 rounded-card border-2 border-border bg-panel p-3.5 text-left shadow-cabinet transition-colors',
          hasOutliers ? 'cursor-pointer hover:border-teal/60' : 'cursor-default',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span className="font-display text-4xl font-black leading-none tabular-nums text-fg">
          {displayPercent}
          <span className="text-xl text-muted">%</span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="label block" style={{ color: interpolateColor(COLOR_STOPS, p) }}>
            {verdict}
          </span>
          <span className="mt-1 block text-xs leading-snug text-muted">
            Similar to the crowd, based on {ready!.sampleSize.toLocaleString()} lists
          </span>
          {hasOutliers ? (
            <span className="label mt-1.5 flex items-center gap-1 text-teal">
              Hot takes
              <ChevronDownIcon
                className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
              />
            </span>
          ) : null}
        </span>
      </motion.button>

      <AnimatePresence>
        {expanded && hasOutliers ? (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="z-30 mt-2 w-full rounded-card border-2 border-border bg-panel p-3 shadow-cabinet sm:absolute sm:right-0 sm:top-full sm:w-[18rem]"
          >
            <p className="label mb-2 text-accent">Your hot takes</p>
            <ul className="flex flex-col gap-2">
              {outliers.map((o) => {
                const meta = metaById.get(o.gameId);
                const up = o.direction === 'higher';
                return (
                  <li key={o.gameId} className="flex items-center gap-2.5">
                    <Thumb meta={meta} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-xs font-bold uppercase tracking-wide text-fg">
                        {meta?.title ?? `Game #${o.gameId}`}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="label text-muted">You</span>
                        <TierChip tier={o.userTier} />
                        {up ? (
                          <ArrowUpIcon className="h-3.5 w-3.5 text-teal" />
                        ) : (
                          <ArrowDownIcon className="h-3.5 w-3.5 text-coin" />
                        )}
                        <TierChip tier={o.communityTier} />
                        <span className="label text-muted">Crowd</span>
                        <span className="sr-only">
                          You ranked it {up ? 'higher' : 'lower'} than the crowd.
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
