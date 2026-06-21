'use client';

import { useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import { type PlayedStatus, useStore } from '@/lib/store';

export type PoolDecision = 'include' | 'reject';

/**
 * Chance that accepting a game ("Played it" / a right-swipe) triggers the spotlight picker
 * instead of including it immediately. The roll only ever fires on a game the user has confirmed
 * they played, so a spotlight is never wasted on a passed game. Inject `random` for deterministic
 * tests.
 */
export const SPOTLIGHT_CHANCE = 1 / 5;

export const STATUS_OPTIONS: { status: PlayedStatus; label: string }[] = [
  { status: 'tried', label: 'Tried briefly' },
  { status: 'finished', label: 'Finished' },
  { status: 'played-a-lot', label: 'Played a lot' },
];

export interface UsePoolDecisionOptions {
  game: Game;
  /** Injected RNG in [0, 1); defaults to Math.random. */
  random?: () => number;
  onDecide: (action: PoolDecision) => void;
}

export interface PoolDecisionApi {
  /** True once a spotlight roll has hit and the played-status picker should be shown. */
  picking: boolean;
  /**
   * Roll the spotlight for an accepted game. On a hit it opens the played-status picker and
   * returns `true` (the caller must wait for `chooseStatus`); on a miss it returns `false`, and
   * the caller should commit with `chooseStatus('finished')`. Splitting the roll from the commit
   * lets the mobile card open the picker the instant the swipe lands while the card flings off.
   */
  playedRollHits: () => boolean;
  /** Pass on the game without adding it to the pool. */
  reject: () => void;
  /** Commit the game with an explicit played status (from the spotlight picker, or `finished`). */
  chooseStatus: (status: PlayedStatus) => void;
}

/**
 * Shared pool decision logic for both the desktop card grid (`PoolCard`) and the mobile swipe deck
 * (`PoolSwipeCard`). Keeping the 1-in-5 spotlight roll, the sound mapping, and the store write in
 * one place stops the two surfaces from drifting apart.
 */
export function usePoolDecision({
  game,
  random = Math.random,
  onDecide,
}: UsePoolDecisionOptions): PoolDecisionApi {
  const addToPool = useStore((s) => s.addToPool);
  const [picking, setPicking] = useState(false);

  const chooseStatus = (status: PlayedStatus) => {
    addToPool(game, status);
    playSound(status === 'played-a-lot' ? 'reveal' : 'success');
    onDecide('include');
  };

  const reject = () => {
    playSound('click');
    onDecide('reject');
  };

  const playedRollHits = () => {
    if (random() < SPOTLIGHT_CHANCE) {
      playSound('blip');
      setPicking(true);
      return true;
    }
    return false;
  };

  return { picking, playedRollHits, reject, chooseStatus };
}
