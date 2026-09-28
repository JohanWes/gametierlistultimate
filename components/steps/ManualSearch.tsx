'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { searchGames } from '@/lib/games/client';
import type { GameResult } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';
import { tapProps } from '@/lib/tap';
import { cn } from '@/lib/utils';

import { CheckIcon, SearchIcon, XIcon } from '../ui/icons';

const DEBOUNCE_MS = 300;

const SOURCE_LABEL: Record<GameResult['source'], string> = {
  local: 'In library',
  igdb: 'From IGDB',
};

/**
 * Always-available manual search. Debounced, local-first (the API falls back to IGDB and
 * persists new games), forgiving with loading and empty states. Tapping a result adds it to
 * the pool with a default played status.
 */
export function ManualSearch() {
  const reduce = useReducedMotion();
  const addToPool = useStore((s) => s.addToPool);
  // Select the stable pool array; deriving ids inside a selector would return a fresh array
  // each render and spin useSyncExternalStore into an infinite loop.
  const pool = useStore((s) => s.pool);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const found = await searchGames(trimmed, { limit: 12 });
      if (cancelled) return;
      setResults(found);
      setLoading(false);
      setSearched(true);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const add = (game: GameResult) => {
    addToPool(game, 'finished');
    playSound('blip');
  };

  const added = new Set(pool.map((e) => e.game.igdbId));

  return (
    // `relative` anchors the results dropdown below. The results *overlay* the playfield rather
    // than pushing it: they're a transient list, and in the contained pool shell every pixel they
    // pushed came straight out of the swipe card (which collapsed to ~4px with results open).
    <div className="relative">
      <label className="flex items-center gap-2.5 rounded-tile border border-border bg-bg px-3 py-2 shadow-soft focus-within:border-teal/70">
        <SearchIcon className="text-muted" />
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any game by name…"
          aria-label="Search games"
          // 16px on phones: iOS Safari zooms the page when focusing a smaller input. The native
          // search X is hidden in favour of our own, which is the same on every browser.
          className="w-full bg-transparent text-base text-fg outline-none placeholder:text-muted sm:text-sm [&::-webkit-search-cancel-button]:hidden"
        />
        {loading ? (
          <span
            aria-label="Searching"
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal border-t-transparent"
          />
        ) : null}
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            {...tapProps(() => setQuery(''))}
            className="-my-1 -mr-1.5 flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-hardware text-sm leading-none text-muted transition-colors duration-150 hover:bg-surface hover:text-fg focus-visible:outline-none"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </label>

      <AnimatePresence initial={false}>
        {query.trim() ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-tile border border-border bg-panel p-1.5 shadow-cabinet"
          >
            {searched && results.length === 0 && !loading ? (
              <p className="px-1 py-1.5 text-sm text-muted">
                No matches for “{query.trim()}”. Try a different spelling or a shorter name.
              </p>
            ) : (
              // Viewport-relative cap so the dropdown can never run past the bottom of a short
              // phone; it scrolls internally instead.
              <ul className="flex max-h-[min(18rem,42svh)] flex-col gap-1.5 overflow-y-auto pr-1">
                {results.map((game) => {
                  const isAdded = added.has(game.igdbId);
                  return (
                    <li key={game.igdbId}>
                      <button
                        type="button"
                        disabled={isAdded}
                        {...tapProps(() => {
                          if (!isAdded) add(game);
                        })}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-tile border px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none',
                          isAdded
                            ? 'cursor-default border-teal/40 bg-teal/10'
                            : 'border-border bg-surface hover:border-teal/60',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-fg">
                            {game.title}
                          </span>
                          <span className="label mt-0.5 flex items-center gap-2 text-muted">
                            {game.releaseYear ? <span>{game.releaseYear}</span> : null}
                            <span className={game.source === 'igdb' ? 'text-accent' : 'text-teal'}>
                              {SOURCE_LABEL[game.source]}
                            </span>
                          </span>
                        </span>
                        <span
                          className={cn(
                            'flex shrink-0 items-center gap-1 font-display text-sm font-bold uppercase tracking-[0.06em]',
                            isAdded ? 'text-teal' : 'text-fg',
                          )}
                        >
                          {isAdded ? (
                            <>
                              <CheckIcon className="h-3.5 w-3.5" /> Added
                            </>
                          ) : (
                            '+ Add'
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
