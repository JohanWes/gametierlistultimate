'use client';

import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';

import { Button } from '../ui/Button';

interface StepScaffoldProps {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Hide the Back button (e.g. first interactive step). */
  hideBack?: boolean;
  nextLabel?: string;
  /** Disable the Next button (e.g. a step whose minimum isn't met yet). */
  nextDisabled?: boolean;
  onNext?: () => void;
  /**
   * Compact header for work surfaces: eyebrow + title share a row, the heading is smaller, and
   * the vertical rhythm tightens so the interactive content starts higher.
   */
  compact?: boolean;
  /** Optional content docked to the right of the header (e.g. a live roster count). */
  headerAside?: React.ReactNode;
}

/** Shared layout + Back/Next navigation for the placeholder step screens. */
export function StepScaffold({
  eyebrow,
  title,
  description,
  children,
  hideBack = false,
  nextLabel = 'Continue',
  nextDisabled = false,
  onNext,
  compact = false,
  headerAside,
}: StepScaffoldProps) {
  const goNext = useStore((s) => s.goNext);
  const goBack = useStore((s) => s.goBack);

  if (compact) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex w-full flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border/70 pb-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {eyebrow ? (
                <p className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-teal">
                  {eyebrow}
                </p>
              ) : null}
              <h1 className="font-display text-2xl font-black uppercase leading-none tracking-[0.02em] text-fg sm:text-3xl">
                {title}
              </h1>
            </div>
            {description ? (
              <p className="mt-1.5 max-w-2xl text-sm leading-snug text-muted">{description}</p>
            ) : null}
          </div>
          {headerAside ? <div className="shrink-0">{headerAside}</div> : null}
        </div>

        {children ? <div className="mt-4 flex w-full flex-1 flex-col">{children}</div> : null}

        <div className="mt-auto flex w-full items-center justify-between gap-3 pt-5">
          {hideBack ? (
            <span />
          ) : (
            <Button variant="ghost" onClick={goBack}>
              ← Back
            </Button>
          )}
          <Button
            disabled={nextDisabled}
            onClick={() => {
              playSound('blip');
              (onNext ?? goNext)();
            }}
          >
            {nextLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="w-full border-b border-border pb-5">
        {eyebrow ? (
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.22em] text-teal">{eyebrow}</p>
        ) : null}
        <h1 className="max-w-4xl font-display text-4xl font-black uppercase leading-[0.95] tracking-[0.02em] text-fg sm:text-5xl">
          {title}
        </h1>
        {description ? <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">{description}</p> : null}
      </div>

      {children ? <div className="mt-8 w-full">{children}</div> : null}

      <div className="mt-auto flex w-full items-center justify-between gap-3 pt-10">
        {hideBack ? (
          <span />
        ) : (
          <Button variant="ghost" onClick={goBack}>
            ← Back
          </Button>
        )}
        <Button
          disabled={nextDisabled}
          onClick={() => {
            playSound('blip');
            (onNext ?? goNext)();
          }}
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
