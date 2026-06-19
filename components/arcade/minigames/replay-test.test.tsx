import { describe, expect, it, vi } from 'vitest';

import { makeGame } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { ReplayTest } from './ReplayTest';

describe('ReplayTest', () => {
  it('emits the chosen replay answer', async () => {
    const game = makeGame({ igdbId: 7, title: 'Hades' });
    const onComplete = vi.fn();
    renderWithProviders(<ReplayTest games={[game]} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^maybe$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([{ type: 'replay', gameId: 7, answer: 'maybe' }]),
    );
  });

  it('emits on touch as well', async () => {
    const game = makeGame({ igdbId: 7, title: 'Hades' });
    const onComplete = vi.fn();
    renderWithProviders(<ReplayTest games={[game]} onComplete={onComplete} />);

    fireEvent.touchEnd(screen.getByRole('button', { name: /yes/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'replay', gameId: 7, answer: 'immediately' },
      ]),
    );
  });
});
