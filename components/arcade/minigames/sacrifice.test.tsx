import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Sacrifice } from './Sacrifice';

describe('Sacrifice', () => {
  it('eliminates the chosen game', async () => {
    const games = makeGames(5);
    const onComplete = vi.fn();
    renderWithProviders(<Sacrifice games={games} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Game 4$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'sacrifice', loserId: 4, opponentIds: [1, 2, 3, 5] },
      ]),
    );
  });

});
