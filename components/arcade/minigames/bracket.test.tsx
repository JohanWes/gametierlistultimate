import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Bracket } from './Bracket';

describe('Bracket', () => {
  it('runs two semis and a final, weighting the final heavier', async () => {
    const games = makeGames(4); // seeds 1,2,3,4
    const onComplete = vi.fn();
    renderWithProviders(<Bracket games={games} onComplete={onComplete} />);

    // Semifinal 1: 1 beats 2.
    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));
    // Semifinal 2: 3 beats 4.
    fireEvent.click(screen.getByRole('button', { name: /^Game 3$/i }));
    // Final: 1 beats 3.
    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: 1, loserId: 2 },
        { type: 'pairwise', winnerId: 3, loserId: 4 },
        { type: 'pairwise', winnerId: 1, loserId: 3, weight: 1.3 },
      ]),
    );
  });

  it('advances the chosen winners on touch as well', async () => {
    const games = makeGames(4);
    const onComplete = vi.fn();
    renderWithProviders(<Bracket games={games} onComplete={onComplete} />);

    fireEvent.touchEnd(screen.getByRole('button', { name: /^Game 2$/i }));
    fireEvent.touchEnd(screen.getByRole('button', { name: /^Game 4$/i }));
    fireEvent.touchEnd(screen.getByRole('button', { name: /^Game 4$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: 2, loserId: 1 },
        { type: 'pairwise', winnerId: 4, loserId: 3 },
        { type: 'pairwise', winnerId: 4, loserId: 2, weight: 1.3 },
      ]),
    );
  });

  it('only emits once, after the final', async () => {
    const games = makeGames(4);
    const onComplete = vi.fn();
    renderWithProviders(<Bracket games={games} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 3$/i }));
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
