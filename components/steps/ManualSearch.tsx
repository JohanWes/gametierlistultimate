'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { searchGames } from '@/lib/games/client';
import type { GameResult } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 300;

export interface ManualSearchProps {
  fetchImpl?: typeof fetch;
}

const SOURCE_LABEL: Record<GameResult['source'], string> = {
  local: 'In library',
  igdb: 'From IGDB',
};

/**
 * Always-available manual search. Debounced, local-first (the API falls back to IGDB and
 * persists new games), forgiving with loading and empty states. Tapping a result adds it to
 * the pool with a default played status.
 */
export function ManualSearch({ fetchImpl }: ManualSearchProps) {
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
      const found = await searchGames(trimmed, { limit: 12 }, fetchImpl ?? fetch);
      if (cancelled) return;
      setResults(found);
      setLoading(false);
      setSearched(true);
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, fetchImpl]);

  const add = (game: GameResult) => {
    addToPool(game, 'finished');
    playSound('blip');
  };

  const added = new Set(pool.map((e) => e.game.igdbId));

  return (
    <div>
      <label className="flex items-center gap-2.5 rounded-tile border border-border bg-bg px-3 py-2 shadow-soft focus-within:border-teal/70">
        <span aria-hidden className="font-mono text-sm text-muted">
          ⌕
        </span>
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any game by name…"
          aria-label="Search games"
          className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted"
        />
        {loading ? (
          <span
            aria-label="Searching"
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-teal border-t-transparent"
          />
        ) : null}
      </label>

      <AnimatePresence initial={false}>
        {query.trim() ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {searched && results.length === 0 && !loading ? (
              <p className="px-1 pt-3 text-sm text-muted">
                No matches for “{query.trim()}”. Try a different spelling or a shorter name.
              </p>
            ) : (
              <ul className="mt-3 flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
                {results.map((game) => {
                  const isAdded = added.has(game.igdbId);
                  return (
                    <li key={game.igdbId}>
                      <button
                        type="button"
                        disabled={isAdded}
                        onClick={() => add(game)}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          if (!isAdded) add(game);
                        }}
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
                          <span className="mt-0.5 flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted">
                            {game.releaseYear ? <span>{game.releaseYear}</span> : null}
                            <span className={game.source === 'igdb' ? 'text-accent' : 'text-teal'}>
                              {SOURCE_LABEL[game.source]}
                            </span>
                          </span>
                        </span>
                        <span
                          className={cn(
                            'shrink-0 font-display text-sm font-bold uppercase tracking-[0.06em]',
                            isAdded ? 'text-teal' : 'text-fg',
                          )}
                        >
                          {isAdded ? 'Added ✓' : '+ Add'}
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
