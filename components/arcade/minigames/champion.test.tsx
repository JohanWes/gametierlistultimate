import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Champion } from './Champion';

describe('Champion', () => {
  it('crowns the chosen game and rejects the rest', async () => {
    const games = makeGames(5);
    const onComplete = vi.fn();
    renderWithProviders(<Champion games={games} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Game 3$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'champion', winnerId: 3, opponentIds: [1, 2, 4, 5] },
      ]),
    );
  });

  it('crowns on touch as well', async () => {
    const games = makeGames(5);
    const onComplete = vi.fn();
    renderWithProviders(<Champion games={games} onComplete={onComplete} />);

    fireEvent.touchEnd(screen.getByRole('button', { name: /^Game 1$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'champion', winnerId: 1, opponentIds: [2, 3, 4, 5] },
      ]),
    );
  });
});
