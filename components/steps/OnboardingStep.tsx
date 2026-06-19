'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

import { Chip } from '../ui/Chip';
import { Toggle } from '../ui/Toggle';
import { StepScaffold } from './StepScaffold';

/** The 16 onboarding genres from the spec (GameMVP.txt Step 2). */
const GENRES = [
  'RPG',
  'Action',
  'Adventure',
  'Strategy',
  'Shooter',
  'Platformer',
  'Horror',
  'Racing',
  'Fighting',
  'Puzzle',
  'Simulation',
  'Sports',
  'Indie',
  'Multiplayer',
  'Story-rich',
  'Open world',
] as const;

/** Preference toggles. Keys are stored in `prefs.flags`; labels are written from the user's side. */
const FLAGS: { key: string; label: string; description: string }[] = [
  { key: 'older', label: 'Include older games', description: 'Classics from before 2010.' },
  { key: 'indie', label: 'Include indie games', description: 'Favor smaller studios.' },
  { key: 'obscure', label: 'Include obscure picks', description: 'Surface lesser-known titles.' },
  { key: 'popularOnly', label: 'Popular games only', description: 'Stick to the well-known hits.' },
  { key: 'allPlatforms', label: 'Games from all platforms', description: 'Console, PC, handheld — everything.' },
  { key: 'chaos', label: 'Chaos mode — surprise me', description: 'Wilder, more unexpected matchups.' },
];

/**
 * Signature element: a lit cabinet marquee that reads back the genres you've selected, or invites
 * a surprise mix when empty. Selected genres glow amber and pop in/out as you toggle them.
 */
function GenreMarquee({ genres }: { genres: string[] }) {
  const reduce = useReducedMotion();
  const empty = genres.length === 0;

  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-card border-2 border-border bg-bg px-3 py-2.5 shadow-cabinet">
      <span
        aria-hidden
        className={cn(
          'flex h-2.5 w-2.5 shrink-0 rounded-hardware',
          empty ? 'bg-border' : 'bg-accent shadow-[0_0_8px_2px_rgb(var(--color-accent)/0.7)]',
          empty || reduce ? '' : 'animate-pulse-glow',
        )}
      />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {empty ? (
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-muted">
            No filter — we&rsquo;ll surprise you
          </span>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {genres.map((g) => (
              <motion.span
                key={g}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                className="whitespace-nowrap rounded-tile bg-accent/12 px-2 py-0.5 font-mono text-[0.7rem] font-bold uppercase tracking-[0.18em] text-accent"
              >
                {g}
              </motion.span>
            ))}
          </AnimatePresence>
        )}
      </div>
      <span className="shrink-0 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted">
        {genres.length}/{GENRES.length}
      </span>
    </div>
  );
}

export function OnboardingStep() {
  const genres = useStore((s) => s.prefs.genres);
  const flags = useStore((s) => s.prefs.flags);
  const toggleGenre = useStore((s) => s.toggleGenre);
  const setFlag = useStore((s) => s.setFlag);

  return (
    <StepScaffold
      eyebrow="Step 2 · Preferences"
      title="What do you reach for?"
      description="Tap the genres you gravitate to, then tune the vibe. We use these to suggest games worth ranking — nothing is locked in, so pick freely or skip ahead."
    >
      <GenreMarquee genres={genres} />

      <div className="mt-5 flex flex-wrap gap-2.5">
        {GENRES.map((g) => (
          <Chip key={g} label={g} selected={genres.includes(g)} onToggle={() => toggleGenre(g)} />
        ))}
      </div>

      <p className="mb-3 mt-8 font-mono text-xs uppercase tracking-[0.22em] text-muted">
        Tune the vibe
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {FLAGS.map((f) => (
          <Toggle
            key={f.key}
            label={f.label}
            description={f.description}
            checked={!!flags[f.key]}
            onChange={(v) => setFlag(f.key, v)}
          />
        ))}
      </div>
    </StepScaffold>
  );
}
