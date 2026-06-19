import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Gauntlet } from './Gauntlet';

// games[0] is the challenger; games[1..] are opponents in climb order.
describe('Gauntlet', () => {
  it('records each bout and stops when the challenger loses', async () => {
    const games = makeGames(4); // challenger 1, opponents 2, 3, 4
    const onComplete = vi.fn();
    renderWithProviders(<Gauntlet games={games} onComplete={onComplete} />);

    // Beat opponent 2, then lose to opponent 3.
    fireEvent.click(screen.getByRole('button', { name: /keeps climbing/i }));
    fireEvent.click(screen.getByRole('button', { name: /stops here/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: 1, loserId: 2 },
        { type: 'pairwise', winnerId: 3, loserId: 1 },
      ]),
    );
  });

  it('completes a full climb when the challenger beats everyone (via touch)', async () => {
    const games = makeGames(4);
    const onComplete = vi.fn();
    renderWithProviders(<Gauntlet games={games} onComplete={onComplete} />);

    fireEvent.touchEnd(screen.getByRole('button', { name: /keeps climbing/i }));
    fireEvent.touchEnd(screen.getByRole('button', { name: /keeps climbing/i }));
    fireEvent.touchEnd(screen.getByRole('button', { name: /keeps climbing/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: 1, loserId: 2 },
        { type: 'pairwise', winnerId: 1, loserId: 3 },
        { type: 'pairwise', winnerId: 1, loserId: 4 },
      ]),
    );
  });
});
