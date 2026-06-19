'use client';

import { useMemo } from 'react';

import type { Game } from '@/lib/games/types';
import type { SnapshotGame, TierMap } from '@/lib/lists-repo';

import { TierBoard } from './TierBoard';

/** Inflate a stored snapshot game into the shape GameCard expects. */
function toGame(s: SnapshotGame): Game {
  return {
    igdbId: s.igdbId,
    title: s.title,
    coverUrl: s.coverUrl,
    genres: [],
    platforms: [],
    releaseYear: null,
    popularity: null,
    rating: null,
    summary: null,
    hasCover: !!s.coverUrl,
    category: null,
  };
}

export interface SharedBoardProps {
  tiers: TierMap;
  games: SnapshotGame[];
}

/** Read-only tier list for a published snapshot (the public /s/:shareId view). */
export function SharedBoard({ tiers, games }: SharedBoardProps) {
  const gamesById = useMemo(
    () => new Map(games.map((g) => [g.igdbId, toGame(g)])),
    [games],
  );
  return <TierBoard tiers={tiers} gamesById={gamesById} />;
}
