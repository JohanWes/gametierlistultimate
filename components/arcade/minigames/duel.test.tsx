import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Duel, Rivalry } from './Duel';

describe('Duel', () => {
  it('emits one pairwise win for the first pick, then locks', async () => {
    const [a, b] = makeGames(2);
    const onComplete = vi.fn();
    renderWithProviders(<Duel games={[a, b]} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Game 2$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: b.igdbId, loserId: a.igdbId },
      ]),
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('frames the rivalry with its own copy', () => {
    renderWithProviders(<Rivalry games={makeGames(2)} onComplete={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /who takes it\?/i })).toBeInTheDocument();
  });
});
