import { describe, expect, it, vi } from 'vitest';

import { tierScore } from '@/lib/ranking';
import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { TierCheck } from './TierCheck';
import { TierRush } from './TierRush';

describe('TierCheck', () => {
  it('pins untouched games to the tier and nudged games one step over', async () => {
    const onComplete = vi.fn();
    renderWithProviders(<TierCheck games={makeGames(3)} boundary="B" onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /move game 2 up a tier/i }));
    fireEvent.click(screen.getByRole('button', { name: /lock it in/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'vibe', gameId: 1, score: tierScore('B') },
        { type: 'vibe', gameId: 2, score: tierScore('A') },
        { type: 'vibe', gameId: 3, score: tierScore('B') },
      ]),
    );
  });
});

describe('TierRush', () => {
  it('emits a vibe per called card', async () => {
    const onComplete = vi.fn();
    renderWithProviders(<TierRush games={makeGames(2)} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^S tier$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^F tier$/ }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'vibe', gameId: 1, score: 100 },
        { type: 'vibe', gameId: 2, score: 0 },
      ]),
    );
  });
});
