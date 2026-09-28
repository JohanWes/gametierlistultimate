interface MinigameHeaderProps {
  /** The one-line task title. */
  title: string;
  /** Optional one-line instruction/status under the title. */
  hint?: string;
}

/**
 * Shared compact header for every minigame: the task as a heading, then the actionable
 * instruction, at a tight scale so the cards (the real decision surface) start high in the panel.
 */
export function MinigameHeader({ title, hint }: MinigameHeaderProps) {
  return (
    <header className="mb-1.5 text-center sm:mb-4">
      <h2 className="font-display text-xl font-black uppercase tracking-[0.02em] text-fg sm:text-2xl">
        {title}
      </h2>
      {hint ? <p className="mt-1 text-sm font-medium text-fg/80 sm:mt-1.5">{hint}</p> : null}
    </header>
  );
}
