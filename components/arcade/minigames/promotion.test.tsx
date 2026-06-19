import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Promotion } from './Promotion';

// matchup order is [lower, upper] with anchorId = upper.
describe('Promotion', () => {
  it('promotes whichever side is picked', async () => {
    const [lower, upper] = makeGames(2);
    const onComplete = vi.fn();
    renderWithProviders(
      <Promotion
        games={[lower, upper]}
        anchorId={upper.igdbId}
        boundary="A"
        onComplete={onComplete}
      />,
    );

    expect(screen.getByRole('heading', { name: /deserve a-tier/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: lower.igdbId, loserId: upper.igdbId },
      ]),
    );
  });

  it('promotes the upper game on touch', async () => {
    const [lower, upper] = makeGames(2);
    const onComplete = vi.fn();
    renderWithProviders(
      <Promotion
        games={[lower, upper]}
        anchorId={upper.igdbId}
        boundary="A"
        onComplete={onComplete}
      />,
    );

    fireEvent.touchEnd(screen.getByRole('button', { name: /^Game 2$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: upper.igdbId, loserId: lower.igdbId },
      ]),
    );
  });
});
