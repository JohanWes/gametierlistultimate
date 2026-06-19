import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { KeepTwo } from './KeepTwo';

describe('KeepTwo', () => {
  it('completes after the second pick with picked + rejected ids', async () => {
    const games = makeGames(5);
    const onComplete = vi.fn();
    renderWithProviders(<KeepTwo games={games} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Game 2$/i }));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Game 5$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pick-k-of-n', pickedIds: [2, 5], rejectedIds: [1, 3, 4] },
      ]),
    );
  });

  it('supports touch and lets a pick be undone before locking', async () => {
    const games = makeGames(5);
    const onComplete = vi.fn();
    renderWithProviders(<KeepTwo games={games} onComplete={onComplete} />);

    // Pick then unpick Game 1, then commit Game 3 + Game 4.
    fireEvent.touchEnd(screen.getByRole('button', { name: /^Game 1$/i }));
    fireEvent.touchEnd(screen.getByRole('button', { name: /^Game 1$/i }));
    fireEvent.touchEnd(screen.getByRole('button', { name: /^Game 3$/i }));
    fireEvent.touchEnd(screen.getByRole('button', { name: /^Game 4$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pick-k-of-n', pickedIds: [3, 4], rejectedIds: [1, 2, 5] },
      ]),
    );
  });
});
