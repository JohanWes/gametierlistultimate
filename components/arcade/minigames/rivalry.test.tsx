import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Rivalry } from './Rivalry';

describe('Rivalry', () => {
  it('emits a pairwise win for the picked side', async () => {
    const [a, b] = makeGames(2);
    const onComplete = vi.fn();
    renderWithProviders(<Rivalry games={[a, b]} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Game 2$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: b.igdbId, loserId: a.igdbId },
      ]),
    );
  });

  it('works on touch', async () => {
    const [a, b] = makeGames(2);
    const onComplete = vi.fn();
    renderWithProviders(<Rivalry games={[a, b]} onComplete={onComplete} />);

    fireEvent.touchEnd(screen.getByRole('button', { name: /^Game 1$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: a.igdbId, loserId: b.igdbId },
      ]),
    );
  });
});
