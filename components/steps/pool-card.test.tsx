import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStore, useStore } from '@/lib/store';
import { makeGame } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen } from '@/test/helpers/render';

import { PoolCard } from './PoolCard';

const game = makeGame({ igdbId: 42, title: 'Hollow Knight', releaseYear: 2017, genres: ['Metroidvania'] });

describe('PoolCard', () => {
  beforeEach(() => resetStore());

  it('adds the game to the pool when Played it is clicked', () => {
    const onDecide = vi.fn();
    renderWithProviders(<PoolCard game={game} onDecide={onDecide} />);

    fireEvent.click(screen.getByRole('button', { name: /played it/i }));

    expect(useStore.getState().pool.map((e) => e.game.igdbId)).toContain(42);
    expect(onDecide).toHaveBeenCalledWith('include');
  });

  it('adds the game to the pool on touch as well', () => {
    const onDecide = vi.fn();
    renderWithProviders(<PoolCard game={game} onDecide={onDecide} />);

    fireEvent.touchEnd(screen.getByRole('button', { name: /played it/i }));

    expect(useStore.getState().pool.map((e) => e.game.igdbId)).toContain(42);
    expect(onDecide).toHaveBeenCalledWith('include');
  });

  it('rejects without adding to the pool', () => {
    const onDecide = vi.fn();
    renderWithProviders(<PoolCard game={game} onDecide={onDecide} />);

    fireEvent.click(screen.getByRole('button', { name: /pass/i }));

    expect(useStore.getState().pool).toHaveLength(0);
    expect(onDecide).toHaveBeenCalledWith('reject');
  });

  it('on a spotlight card, Played it reveals the status picker and records the chosen status', () => {
    const onDecide = vi.fn();
    renderWithProviders(<PoolCard game={game} spotlight onDecide={onDecide} />);

    // First tap reveals the picker rather than including immediately.
    fireEvent.click(screen.getByRole('button', { name: /played it/i }));
    expect(useStore.getState().pool).toHaveLength(0);
    expect(screen.getByText(/how much did you play it/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /played a lot/i }));

    const entry = useStore.getState().pool.find((e) => e.game.igdbId === 42);
    expect(entry?.status).toBe('played-a-lot');
    expect(onDecide).toHaveBeenCalledWith('include');
  });
});
