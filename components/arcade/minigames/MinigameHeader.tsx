import { cn } from '@/lib/utils';

type Tone = 'teal' | 'accent' | 'coin';

const TONE_CLASS: Record<Tone, string> = {
  teal: 'text-teal',
  accent: 'text-accent',
  coin: 'text-coin',
};

export interface MinigameHeaderProps {
  /** Small kicker above the title (e.g. "Crown a champion"). Optional for prompt-only boards. */
  eyebrow?: string;
  /** The one-line task title. */
  title: string;
  /** Optional one-line instruction/status under the title. */
  hint?: string;
  /** Accent color for the eyebrow. */
  tone?: Tone;
}

/**
 * Shared compact header for every minigame. Keeps the eyebrow → title → hint rhythm but at a
 * tighter scale so the cards (the real decision surface) start higher in the arcade panel.
 */
export function MinigameHeader({ eyebrow, title, hint, tone = 'teal' }: MinigameHeaderProps) {
  return (
    <header className="mb-4 text-center">
      {eyebrow ? (
        <p
          className={cn(
            'mb-1 font-mono text-[0.68rem] uppercase tracking-[0.24em]',
            TONE_CLASS[tone],
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-display text-xl font-black uppercase tracking-[0.02em] text-fg sm:text-2xl">
        {title}
      </h2>
      {hint ? (
        <p className="mt-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">{hint}</p>
      ) : null}
    </header>
  );
}
