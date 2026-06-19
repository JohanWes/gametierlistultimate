import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { HigherLower } from './HigherLower';

describe('HigherLower', () => {
  it('"Better" makes the challenger win against the benchmark', async () => {
    const [anchor, challenger] = makeGames(2);
    const onComplete = vi.fn();
    renderWithProviders(
      <HigherLower games={[anchor, challenger]} anchorId={anchor.igdbId} onComplete={onComplete} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^better$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: challenger.igdbId, loserId: anchor.igdbId },
      ]),
    );
  });

  it('"Worse" makes the benchmark win (via touch)', async () => {
    const [anchor, challenger] = makeGames(2);
    const onComplete = vi.fn();
    renderWithProviders(
      <HigherLower games={[anchor, challenger]} anchorId={anchor.igdbId} onComplete={onComplete} />,
    );

    fireEvent.touchEnd(screen.getByRole('button', { name: /^worse$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: anchor.igdbId, loserId: challenger.igdbId },
      ]),
    );
  });

  it('"About equal" emits an about-equal nudge', async () => {
    const [anchor, challenger] = makeGames(2);
    const onComplete = vi.fn();
    renderWithProviders(
      <HigherLower games={[anchor, challenger]} anchorId={anchor.igdbId} onComplete={onComplete} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /about equal/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'about-equal', gameIds: [challenger.igdbId, anchor.igdbId] },
      ]),
    );
  });

  it('"Skip" emits a skip', async () => {
    const [anchor, challenger] = makeGames(2);
    const onComplete = vi.fn();
    renderWithProviders(
      <HigherLower games={[anchor, challenger]} anchorId={anchor.igdbId} onComplete={onComplete} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'skip', gameIds: [challenger.igdbId, anchor.igdbId] },
      ]),
    );
  });
});
