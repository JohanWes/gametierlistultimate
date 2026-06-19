'use client';

import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

/** Always-visible sound toggle, wired to the store's `ui.soundOn`. */
export function MuteButton({ className }: { className?: string }) {
  const soundOn = useStore((s) => s.ui.soundOn);
  const toggleSound = useStore((s) => s.toggleSound);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={soundOn}
      aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
      onClick={toggleSound}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-hardware border border-border',
        'bg-panel text-muted shadow-soft transition-colors duration-150 hover:border-teal/60 hover:text-fg',
        'focus-visible:outline-none',
        className,
      )}
    >
      {soundOn ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
    </button>
  );
}

function SpeakerOnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 9v6h4l5 4V5L8 9H4z"
        fill="currentColor"
      />
      <path
        d="M16 8.5a4 4 0 0 1 0 7M18.5 6a7 7 0 0 1 0 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path
        d="M16 9.5l5 5m0-5l-5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
