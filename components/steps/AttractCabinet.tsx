'use client';

import { motion, stagger, useAnimate, useReducedMotion } from 'framer-motion';
import { useEffect } from 'react';

import { cn } from '@/lib/utils';

import { TIER_ORDER, type Tier } from '../ui/Row';

const TIER_BG: Record<Tier, string> = {
  S: 'bg-tier-s',
  A: 'bg-tier-a',
  B: 'bg-tier-b',
  C: 'bg-tier-c',
  D: 'bg-tier-d',
  E: 'bg-tier-e',
  F: 'bg-tier-f',
};

interface Cover {
  /** File under `public/assets/boxart/`. */
  slug: string;
  /** Used for alt text. */
  title: string;
}

const c = (slug: string, title: string): Cover => ({ slug, title });

/**
 * Hand-placed demo covers per tier. Purely decorative — this is the cabinet's "attract mode"
 * (the idle demo loop a real arcade machine plays), not a real ranking. Box art lives in
 * `public/assets/boxart/` so it always loads, independent of Mongo/IGDB.
 *
 * Deliberately disjoint from the pool-builder's starter shelf (`lib/games/starter-set.ts`):
 * the user meets ~35 curated titles during pool selection, so showing different games here
 * keeps the front page from feeling repetitive.
 */
const TIER_COVERS: Record<Tier, Cover[]> = {
  S: [
    c('disco-elysium', 'Disco Elysium'),
    c('outer-wilds', 'Outer Wilds'),
    c('death-stranding', 'Death Stranding'),
    c('ghost-of-tsushima', 'Ghost of Tsushima'),
    c('horizon-zero-dawn', 'Horizon Zero Dawn'),
  ],
  A: [
    c('grand-theft-auto-5', 'Grand Theft Auto V'),
    c('dark-souls-3', 'Dark Souls III'),
    c('control', 'Control'),
    c('divinity-original-sin-2', 'Divinity: Original Sin 2'),
    c('spider-man-remastered', "Marvel's Spider-Man Remastered"),
  ],
  B: [
    c('bioshock-infinite', 'BioShock Infinite'),
    c('monster-hunter-world', 'Monster Hunter: World'),
    c('it-takes-two', 'It Takes Two'),
    c('subnautica', 'Subnautica'),
  ],
  C: [
    c('celeste', 'Celeste'),
    c('cuphead', 'Cuphead'),
    c('stray', 'Stray'),
    c('inscryption', 'Inscryption'),
  ],
  D: [c('undertale', 'Undertale'), c('ori-blind-forest', 'Ori and the Blind Forest')],
  E: [c('cyberpunk-2077', 'Cyberpunk 2077'), c('vampire-survivors', 'Vampire Survivors')],
  F: [c('terraria', 'Terraria'), c('rimworld', 'RimWorld')],
};

/** Flat list of every game shown in the cabinet — used by a test to guard against starter-set overlap. */
export const ATTRACT_COVER_TITLES: readonly string[] = TIER_ORDER.flatMap((t) =>
  TIER_COVERS[t].map((cover) => cover.title),
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface AttractCabinetProps {
  /** Pause the attract-mode loop when the cabinet is off-screen (keep-alive). Defaults to true. */
  active?: boolean;
}

/**
 * The signature "Attract Mode" cabinet. An infinite, self-playing tier-list demo: covers deal
 * out tier-by-tier (top→bottom), hold, then retract (bottom→top), forever. Built with
 * `useAnimate` so the whole timeline runs on the compositor without re-rendering React.
 *
 * Pass `active={false}` to pause the loop when the cabinet is hidden (e.g. the welcome screen
 * is keep-alive but not the current step) — avoids burning CPU on animations nobody sees.
 */
export function AttractCabinet({ active = true }: AttractCabinetProps) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate();

  useEffect(() => {
    if (reduce || !active) return; // covers render in their resting (visible) state; no loop.
    let cancelled = false;

    // DOM order is S→F, left→right. `from: 'first'` deals top-to-bottom / left-to-right;
    // `from: 'last'` retracts bottom-to-top / right-to-left — exactly the brief.
    const extend = { opacity: 1, x: 0, scale: 1, filter: 'brightness(1)' };
    const retract = { opacity: 0, x: -26, scale: 0.86, filter: 'brightness(1.4)' };
    const ease = [0.16, 1, 0.3, 1] as const;

    async function loop() {
      while (!cancelled) {
        await animate('[data-cover]', extend, {
          duration: 0.5,
          ease,
          delay: stagger(0.045, { from: 'first' }),
        });
        if (cancelled) break;
        await sleep(1100); // hold the full board — the money shot
        if (cancelled) break;
        await animate('[data-cover]', retract, {
          duration: 0.38,
          ease: 'easeIn',
          delay: stagger(0.04, { from: 'last' }),
        });
        if (cancelled) break;
        await sleep(420);
      }
    }
    void loop();
    return () => {
      cancelled = true;
    };
  }, [animate, reduce, active]);

  return (
    <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-card border-2 border-border bg-bg shadow-cabinet">
      {/* ambient tier-spectrum glow behind the screen */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px opacity-60 blur-2xl"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, rgb(var(--tier-s) / 0.18), transparent 60%), radial-gradient(120% 90% at 50% 100%, rgb(var(--tier-d) / 0.16), transparent 60%)',
        }}
      />

      <div className="relative flex flex-col gap-2 p-3 sm:p-4">
        {/* marquee header */}
        <div className="flex items-center justify-between border-b border-border/80 pb-2 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-muted">
          <span className="text-fg/80">Attract&nbsp;Mode</span>
          <span className="flex items-center gap-1.5 text-teal">
            <motion.span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-hardware bg-teal"
              animate={reduce ? undefined : { opacity: [1, 0.2, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            Demo
          </span>
        </div>

        <div ref={scope} className="flex w-fit flex-col gap-1.5">
          {TIER_ORDER.map((tier) => (
            <div key={tier} className="flex items-stretch gap-1.5 sm:gap-2">
              <span
                className={cn(
                  'z-10 grid aspect-square h-[52px] shrink-0 place-items-center rounded-tile font-display text-xl font-black text-black/85 shadow-soft sm:h-[62px] lg:h-[72px]',
                  TIER_BG[tier],
                )}
              >
                {tier}
              </span>
              {/* shelf: covers tuck behind the label on retract */}
              <div className="relative flex h-[52px] items-stretch gap-1.5 overflow-hidden rounded-tile bg-panel/60 px-1 sm:h-[62px] lg:h-[72px]">
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-3 bg-gradient-to-r from-bg/90 to-transparent"
                />
                {TIER_COVERS[tier].map((cover) => (
                  <motion.div
                    key={cover.slug}
                    data-cover
                    className="relative h-full overflow-hidden rounded-[2px] border border-black/40 shadow-soft"
                    style={{
                      aspectRatio: '2 / 3',
                      opacity: reduce ? 1 : 0,
                      x: reduce ? 0 : -26,
                      scale: reduce ? 1 : 0.86,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/assets/boxart/${cover.slug}.jpg`}
                      alt={cover.title}
                      draggable={false}
                      className="h-full w-full select-none object-cover"
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CRT scanlines + vignette — sells the cabinet without stealing focus */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 rounded-card"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgb(0 0 0 / 0.16) 0px, rgb(0 0 0 / 0.16) 1px, transparent 1px, transparent 3px)',
          boxShadow: 'inset 0 0 40px 8px rgb(0 0 0 / 0.55)',
          mixBlendMode: 'multiply',
        }}
      />
    </div>
  );
}
