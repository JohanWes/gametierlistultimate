'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { fetchGameplayVideo } from '@/lib/games/client';
import type { Game } from '@/lib/games/types';
import { gameplayQuery } from '@/lib/youtube';

/** The clicked cover and its on-screen rect — the rect drives the origin-aware expand. */
export interface VideoTarget {
  game: Game;
  rect: DOMRect;
}

export interface GameplayVideoModalProps {
  /** The game to play footage for, plus the cover rect to expand from. Null = closed. */
  video: VideoTarget | null;
  onClose: () => void;
  /** Injectable fetch for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

type LoadState = { status: 'loading' } | { status: 'ready'; videoId: string } | { status: 'empty' };

/** Resting width of the dialog (matches max-w-3xl = 48rem) clamped to the viewport. */
function restingWidth(): number {
  if (typeof window === 'undefined') return 768;
  return Math.min(window.innerWidth * 0.92, 768);
}

/**
 * Compute the framer-motion `initial` transform so the panel appears to grow out of the exact cover
 * the user clicked (translate from the cover's center to the viewport center, scaled down to the
 * cover's size), then animates to its resting centered position.
 */
function expandFrom(rect: DOMRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const coverCenterX = rect.left + rect.width / 2;
  const coverCenterY = rect.top + rect.height / 2;
  return {
    x: coverCenterX - vw / 2,
    y: coverCenterY - vh / 2,
    scale: Math.max(0.1, rect.width / restingWidth()),
    opacity: 0,
  };
}

/**
 * "Cabinet screen powers on": clicking a boxart in the pool builder opens this popup, where the
 * media panel expands out of the clicked cover and plays a long-form gameplay walkthrough. The
 * video id is resolved on demand (and cached server-side). When nothing embeddable resolves, the
 * footer's "Open on YouTube" link is the always-present escape hatch.
 */
export function GameplayVideoModal({ video, onClose, fetchImpl }: GameplayVideoModalProps) {
  const reduce = useReducedMotion();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const game = video?.game ?? null;
  const igdbId = game?.igdbId;

  // Resolve the video whenever a new game opens. Ignore stale responses if the user reopens quickly.
  useEffect(() => {
    if (igdbId == null) return;
    let active = true;
    setState({ status: 'loading' });
    fetchGameplayVideo(igdbId, fetchImpl)
      .then((videoId) => {
        if (!active) return;
        setState(videoId ? { status: 'ready', videoId } : { status: 'empty' });
      })
      .catch(() => {
        if (active) setState({ status: 'empty' });
      });
    return () => {
      active = false;
    };
  }, [igdbId, fetchImpl]);

  // Close on Escape (mouse + touch close via the backdrop button).
  useEffect(() => {
    if (!video) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [video, onClose]);

  const searchUrl = game
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(gameplayQuery(game.title))}`
    : '#';

  return (
    <AnimatePresence>
      {video && game ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label="Close video"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Gameplay footage for ${game.title}`}
            initial={reduce ? { opacity: 0 } : expandFrom(video.rect)}
            animate={reduce ? { opacity: 1 } : { x: 0, y: 0, scale: 1, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={reduce ? { duration: 0.18 } : { type: 'spring', stiffness: 380, damping: 32 }}
            className="relative z-10 w-full max-w-3xl rounded-card border-2 border-border bg-panel p-4 shadow-cabinet sm:p-5"
          >
            <div className="mb-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="mb-0.5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.2em] text-accent">
                  ▶ Now playing
                </p>
                <h2 className="truncate font-display text-xl font-black uppercase tracking-[0.02em] text-fg sm:text-2xl">
                  {game.title}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-hardware border border-border bg-surface text-lg leading-none text-muted shadow-soft transition-colors duration-150 hover:border-coin/70 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ✕
              </button>
            </div>

            <div className="mb-3 h-px w-full bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

            <div className="relative aspect-video w-full overflow-hidden rounded-tile border-2 border-border bg-black shadow-cabinet">
              {state.status === 'ready' ? (
                <>
                  <iframe
                    key={state.videoId}
                    className="absolute inset-0 h-full w-full"
                    src={`https://www.youtube-nocookie.com/embed/${state.videoId}?autoplay=1&rel=0&modestbranding=1`}
                    title={`${game.title} gameplay`}
                    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                  {reduce ? null : (
                    // Brief CRT "power-on" sweep across the screen once the embed mounts.
                    <motion.div
                      aria-hidden
                      initial={{ opacity: 0.85, x: '-100%' }}
                      animate={{ opacity: 0, x: '100%' }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                      className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                    />
                  )}
                </>
              ) : state.status === 'loading' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="relative h-1.5 w-2/5 overflow-hidden rounded-hardware bg-surface-elevated">
                    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
                  </div>
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-muted">
                    Loading footage…
                  </p>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <p className="font-display text-base font-bold uppercase tracking-[0.04em] text-fg">
                    No clip queued up
                  </p>
                  <p className="max-w-sm text-sm text-muted">
                    Couldn&rsquo;t pull footage in-app. Open a gameplay search on YouTube instead.
                  </p>
                  <a
                    href={searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-control border-2 border-accent/70 bg-accent/12 px-4 py-2 font-display text-sm font-black uppercase tracking-[0.08em] text-accent shadow-soft transition-colors duration-150 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Watch gameplay on YouTube ↗
                  </a>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="truncate font-mono text-[0.62rem] uppercase tracking-[0.16em] text-muted">
                Tap outside or press Esc to close
              </p>
              <a
                href={searchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-teal transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open on YouTube ↗
              </a>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
