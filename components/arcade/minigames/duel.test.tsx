import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Duel } from './Duel';

describe('Duel', () => {
  it('emits a pairwise win for the clicked cover', async () => {
    const [a, b] = makeGames(2);
    const onComplete = vi.fn();
    renderWithProviders(<Duel games={[a, b]} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: a.igdbId, loserId: b.igdbId },
      ]),
    );
  });

  it('works with touch as well', async () => {
    const [a, b] = makeGames(2);
    const onComplete = vi.fn();
    renderWithProviders(<Duel games={[a, b]} onComplete={onComplete} />);

    fireEvent.touchEnd(screen.getByRole('button', { name: /^Game 2$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: b.igdbId, loserId: a.igdbId },
      ]),
    );
  });

  it('locks after the first pick', async () => {
    const [a, b] = makeGames(2);
    const onComplete = vi.fn();
    renderWithProviders(<Duel games={[a, b]} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 2$/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
