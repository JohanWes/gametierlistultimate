import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Lineup } from './Lineup';

/**
 * The lineup must have a real, non-drag mobile path: tap cards in favorite→least order into
 * numbered slots, then lock it in. These tests exercise that tap fallback exclusively.
 */
describe('Lineup — tap-to-order fallback', () => {
  it('orders by tap sequence and emits a lineup outcome', async () => {
    const games = makeGames(5);
    const onComplete = vi.fn();
    renderWithProviders(<Lineup games={games} onComplete={onComplete} />);

    // Tap in a non-trivial favourite→least order.
    for (const id of [2, 1, 4, 5, 3]) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Game ${id}$`, 'i') }));
    }

    // Only once every card is placed does the lock-in appear.
    const lock = await screen.findByRole('button', { name: /lock in ranking/i });
    fireEvent.click(lock);

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([{ type: 'lineup', orderedIds: [2, 1, 4, 5, 3] }]),
    );
  });

  it('places via touch and supports removing a placed card', async () => {
    const games = makeGames(5);
    const onComplete = vi.fn();
    renderWithProviders(<Lineup games={games} onComplete={onComplete} />);

    for (const id of [1, 2, 3, 4, 5]) {
      fireEvent.touchEnd(screen.getByRole('button', { name: new RegExp(`^Game ${id}$`, 'i') }));
    }

    // Remove Game 1 (was rank 1) — it returns to the pool, so lock-in disappears.
    fireEvent.click(screen.getByRole('button', { name: /remove game 1/i }));
    expect(screen.queryByRole('button', { name: /lock in ranking/i })).not.toBeInTheDocument();

    // Re-place it last, then lock in.
    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /lock in ranking/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([{ type: 'lineup', orderedIds: [2, 3, 4, 5, 1] }]),
    );
  });
});
