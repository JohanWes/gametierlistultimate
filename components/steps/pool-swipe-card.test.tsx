import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStore, useStore } from '@/lib/store';
import { makeGame } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen } from '@/test/helpers/render';

import { PoolSwipeCard } from './PoolSwipeCard';

const game = makeGame({ igdbId: 42, title: 'Hollow Knight', releaseYear: 2017, genres: ['Metroidvania'] });

/**
 * The card decision logic is shared with the desktop PoolCard; here we exercise it through the
 * mobile ✕ / ✓ buttons (a real drag has no layout in jsdom). Forcing reduced motion makes the
 * fling resolve synchronously so the decision commits without waiting on an animation.
 */
const originalMatchMedia = window.matchMedia;

describe('PoolSwipeCard', () => {
  beforeEach(() => {
    resetStore();
    window.matchMedia = ((query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('adds the game when Played it is tapped (spotlight roll misses)', () => {
    const onDecide = vi.fn();
    renderWithProviders(<PoolSwipeCard game={game} random={() => 1} onDecide={onDecide} />);

    fireEvent.click(screen.getByRole('button', { name: /played it/i }));

    expect(useStore.getState().pool.map((e) => e.game.igdbId)).toContain(42);
    expect(onDecide).toHaveBeenCalledWith('include');
  });

  it('passes without adding to the pool', () => {
    const onDecide = vi.fn();
    renderWithProviders(<PoolSwipeCard game={game} random={() => 1} onDecide={onDecide} />);

    fireEvent.click(screen.getByRole('button', { name: /pass/i }));

    expect(useStore.getState().pool).toHaveLength(0);
    expect(onDecide).toHaveBeenCalledWith('reject');
  });

  it('reveals the spotlight sheet on a hit and records the chosen status', () => {
    const onDecide = vi.fn();
    renderWithProviders(<PoolSwipeCard game={game} random={() => 0} onDecide={onDecide} />);

    fireEvent.click(screen.getByRole('button', { name: /played it/i }));
    expect(useStore.getState().pool).toHaveLength(0);
    expect(screen.getByText(/how much did you play it/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /played a lot/i }));

    const entry = useStore.getState().pool.find((e) => e.game.igdbId === 42);
    expect(entry?.status).toBe('played-a-lot');
    expect(onDecide).toHaveBeenCalledWith('include');
  });

  it('includes as finished when the spotlight roll just misses the threshold', () => {
    const onDecide = vi.fn();
    renderWithProviders(<PoolSwipeCard game={game} random={() => 0.99} onDecide={onDecide} />);

    fireEvent.click(screen.getByRole('button', { name: /played it/i }));

    expect(screen.queryByText(/how much did you play it/i)).not.toBeInTheDocument();
    const entry = useStore.getState().pool.find((e) => e.game.igdbId === 42);
    expect(entry?.status).toBe('finished');
    expect(onDecide).toHaveBeenCalledWith('include');
  });
});
