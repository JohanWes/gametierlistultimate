import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Podium } from './Podium';

describe('Podium', () => {
  it('emits the ordered top three plus a pick over the rest', async () => {
    const games = makeGames(6);
    const onComplete = vi.fn();
    renderWithProviders(<Podium games={games} onComplete={onComplete} />);

    // Crown 2 (gold), 5 (silver), 1 (bronze).
    fireEvent.click(screen.getByRole('button', { name: /^Game 2$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 5$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));

    fireEvent.click(screen.getByRole('button', { name: /lock in podium/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'lineup', orderedIds: [2, 5, 1] },
        { type: 'pick-k-of-n', pickedIds: [2, 5, 1], rejectedIds: [3, 4, 6] },
      ]),
    );
  });

  it('only offers lock-in once three are chosen', () => {
    const games = makeGames(6);
    renderWithProviders(<Podium games={games} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 2$/i }));
    expect(screen.queryByRole('button', { name: /lock in podium/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Game 3$/i }));
    expect(screen.getByRole('button', { name: /lock in podium/i })).toBeInTheDocument();
  });

  it('locks after lock-in (no double emit)', async () => {
    const games = makeGames(6);
    const onComplete = vi.fn();
    renderWithProviders(<Podium games={games} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 2$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 3$/i }));

    const button = screen.getByRole('button', { name: /lock in podium/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
