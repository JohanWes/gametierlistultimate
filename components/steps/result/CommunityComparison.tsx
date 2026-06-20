'use client';

import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchComparison, fetchSharedComparison, type ComparisonResult } from '@/lib/compare-client';
import type { SnapshotGame } from '@/lib/lists-repo';
import { type Tier, type TierMap } from '@/lib/ranking';
import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

/** Minimal cover/title metadata the outlier rows need. */
type Meta = { title: string; coverUrl: string | null };

export interface CommunityComparisonProps {
  /** Owner, pre-publish: the live tiers to compare. Omit when `shareId` is set. */
  tiers?: TierMap;
  /** Published list: fetch the server-computed comparison for this shareId instead. */
  shareId?: string;
  /** Cover/title lookup for outliers (owner's live game map). */
  gamesById?: Map<number, Meta>;
  /** Cover/title lookup for outliers (published snapshot games). */
  games?: SnapshotGame[];
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  /** Set false in tests to render the final percentage without the count-up tween. */
  animateCount?: boolean;
  className?: string;
}

// Static class map keeps Tailwind's scanner happy (no dynamic class strings).
const TIER_BG: Record<Tier, string> = {
  S: 'bg-tier-s',
  A: 'bg-tier-a',
  B: 'bg-tier-b',
  C: 'bg-tier-c',
  D: 'bg-tier-d',
  E: 'bg-tier-e',
  F: 'bg-tier-f',
};

/**
 * Score → color across purple (you diverge) → gold (middle) → teal (you align with the crowd).
 * Grounded in the app's palette: teal is the signature "agreement" hue, purple flags individuality.
 */
type ColorStop = { at: number; rgb: readonly [number, number, number] };
const COLOR_STOPS: readonly ColorStop[] = [
  { at: 0, rgb: [168, 142, 246] }, // tier-e purple — lone wolf
  { at: 55, rgb: [241, 178, 58] }, // accent gold — middle
  { at: 100, rgb: [67, 202, 190] }, // teal — crowd-certified
];

function tint(percent: number, alpha = 1): string {
  const s = Math.max(0, Math.min(100, percent));
  let lo = COLOR_STOPS[0];
  let hi = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (let i = 0; i < COLOR_STOPS.length - 1; i += 1) {
    if (s >= COLOR_STOPS[i].at && s <= COLOR_STOPS[i + 1].at) {
      lo = COLOR_STOPS[i];
      hi = COLOR_STOPS[i + 1];
      break;
    }
  }
  const span = hi.at - lo.at || 1;
  const t = (s - lo.at) / span;
  const r = Math.round(lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * t);
  const g = Math.round(lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * t);
  const b = Math.round(lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * t);
  return `rgb(${r} ${g} ${b}${alpha !== 1 ? ` / ${alpha}` : ''})`;
}

/** One-word verdict keyed off how much the user lines up with the crowd. */
function verdictFor(percent: number): string {
  if (percent >= 85) return 'Crowd-certified';
  if (percent >= 60) return 'In good company';
  if (percent >= 40) return 'Your own taste';
  return 'Lone wolf';
}

/** Count a number up to `target` on first reveal; jumps instantly under reduced motion / tests. */
function useCountUp(target: number | null, enabled: boolean): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(target ?? 0);
  useEffect(() => {
    if (target === null) {
      setValue(0);
      return;
    }
    if (!enabled || reduce) {
      setValue(target);
      return;
    }
    const controls = animate(0, target, {
      duration: 1.1,
      ease: 'easeOut',
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [target, enabled, reduce]);
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
 * Phase 11 — a low-key "you vs the crowd" plate that auto-loads after the reveal. The signature is
 * a vertical score-tint gauge (an echo of the arcade's vibe meter) beside a count-up percentage and
 * a mono verdict stamp; tapping it opens a compact drawer of "hot takes" — the games where the user
 * most disagrees with the community. Quiet by default, mouse + touch, mute + reduced-motion aware.
 */
export function CommunityComparison({
  tiers,
  shareId,
  gamesById,
  games,
  fetchImpl,
  animateCount = true,
  className,
}: CommunityComparisonProps) {
  const reduce = useReducedMotion();
  const soundOn = useStore((s) => s.ui.soundOn);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [expanded, setExpanded] = useState(false);
  const announced = useRef(false);

  const metaById = useMemo<Map<number, Meta>>(() => {
    if (gamesById) return gamesById;
    const m = new Map<number, Meta>();
    for (const g of games ?? []) m.set(g.igdbId, { title: g.title, coverUrl: g.coverUrl });
    return m;
  }, [gamesById, games]);

  // Fetch once on mount — the panel mounts when the reveal finishes with the final tiers.
  useEffect(() => {
    let alive = true;
    const run = shareId
      ? fetchSharedComparison(shareId, fetchImpl)
      : fetchComparison(tiers ?? ({} as TierMap), fetchImpl);
    run.then((result) => {
      if (alive) setState({ kind: 'ready', result });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = state.kind === 'ready' ? state.result : null;
  const hasData = ready?.similarityPercent != null;
  const percent = hasData ? (ready as ComparisonResult).similarityPercent! : null;
  const displayPercent = useCountUp(hasData ? percent : null, animateCount);

  // One soft cue the first time a real result lands (mute respected).
  useEffect(() => {
    if (hasData && !announced.current) {
      announced.current = true;
      if (soundOn) playSound('reveal');
    }
  }, [hasData, soundOn]);

  const outliers = ready?.outliers ?? [];
  const hasOutliers = outliers.length > 0;

  const toggle = useCallback(() => {
    if (!hasOutliers) return;
    if (soundOn) playSound('blip');
    setExpanded((v) => !v);
  }, [hasOutliers, soundOn]);

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
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-teal">Community</p>
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
        onClick={toggle}
        onTouchEnd={(e) => {
          e.preventDefault();
          toggle();
        }}
        aria-expanded={hasOutliers ? expanded : undefined}
        aria-label={`You match ${p}% of players${hasOutliers ? '. Show your hot takes.' : ''}`}
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 460, damping: 30 }}
        className={cn(
          'group relative flex w-full items-stretch gap-3 overflow-hidden rounded-card border-2 border-border bg-panel p-3.5 text-left shadow-cabinet transition-colors',
          hasOutliers ? 'cursor-pointer hover:border-teal/60' : 'cursor-default',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {/* Score-tinted inner glow — barely there. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-card"
          style={{ boxShadow: `inset 0 0 28px ${tint(p, 0.14)}` }}
        />

        {/* Signature: a vertical score gauge that fills toward the top as agreement rises. */}
        <span
          aria-hidden
          className="relative w-1.5 shrink-0 self-stretch overflow-hidden rounded-full bg-bg/70"
        >
          <motion.span
            className="absolute inset-x-0 bottom-0 rounded-full"
            style={{ backgroundColor: tint(p, 1) }}
            initial={false}
            animate={{ height: `${p}%` }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }}
          />
        </span>

        <span className="relative min-w-0 flex-1">
          <span className="flex items-baseline gap-1">
            <span className="font-display text-3xl font-black leading-none tabular-nums text-fg">
              {displayPercent}
            </span>
            <span className="font-display text-base font-black leading-none text-muted">%</span>
            <span
              className="ml-auto font-mono text-[0.58rem] font-bold uppercase tracking-[0.16em]"
              style={{ color: tint(p, 1) }}
            >
              {verdict}
            </span>
          </span>

          <span className="mt-1.5 block font-mono text-[0.58rem] uppercase tracking-[0.16em] text-muted">
            similar to the crowd
          </span>

          <span className="mt-1 flex items-center justify-between gap-2">
            <span className="font-mono text-[0.56rem] text-muted/70">
              based on {ready!.sampleSize.toLocaleString()} lists
            </span>
            {hasOutliers ? (
              <span className="shrink-0 font-mono text-[0.56rem] font-bold uppercase tracking-[0.16em] text-teal">
                {expanded ? 'hide ▴' : 'hot takes ▾'}
              </span>
            ) : null}
          </span>
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
            <p className="mb-2 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-accent">
              Your hot takes
            </p>
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
                        <span className="font-mono text-[0.52rem] uppercase tracking-wider text-muted">
                          You
                        </span>
                        <TierChip tier={o.userTier} />
                        <span
                          aria-hidden
                          className="text-[0.7rem] font-black leading-none"
                          style={{ color: up ? 'rgb(67 202 190)' : 'rgb(210 58 49)' }}
                        >
                          {up ? '▲' : '▼'}
                        </span>
                        <TierChip tier={o.communityTier} />
                        <span className="font-mono text-[0.52rem] uppercase tracking-wider text-muted">
                          Crowd
                        </span>
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
