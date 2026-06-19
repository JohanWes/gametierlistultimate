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
  onNext?: () => void;
}

/** Shared layout + Back/Next navigation for the placeholder step screens. */
export function StepScaffold({
  eyebrow,
  title,
  description,
  children,
  hideBack = false,
  nextLabel = 'Continue',
  onNext,
}: StepScaffoldProps) {
  const goNext = useStore((s) => s.goNext);
  const goBack = useStore((s) => s.goBack);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-3xl">
        {eyebrow ? (
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-3xl font-extrabold leading-[1.05] tracking-tight text-fg sm:text-4xl">
          {title}
        </h1>
        {description ? <p className="mt-3 max-w-prose text-muted">{description}</p> : null}
      </div>

      {children ? <div className="mx-auto mt-8 w-full max-w-3xl">{children}</div> : null}

      <div className="mx-auto mt-auto flex w-full max-w-3xl items-center justify-between gap-3 pt-10">
        {hideBack ? (
          <span />
        ) : (
          <Button variant="ghost" onClick={goBack}>
            ← Back
          </Button>
        )}
        <Button
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
