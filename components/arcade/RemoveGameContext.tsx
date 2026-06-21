'use client';

import { createContext, useContext } from 'react';

import type { Game } from '@/lib/games/types';

/**
 * Lets any arcade cover render a delete-X without threading a prop through all 14 minigames.
 * `ArcadeStep` provides the handler; `ArcadeCard` consumes it. Standalone module so the minigame
 * components don't import `ArcadeStep` (which would create a cycle).
 */
const RemoveGameContext = createContext<((game: Game) => void) | undefined>(undefined);

export const RemoveGameProvider = RemoveGameContext.Provider;

export function useRemoveGame(): ((game: Game) => void) | undefined {
  return useContext(RemoveGameContext);
}
