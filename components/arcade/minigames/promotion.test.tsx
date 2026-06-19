import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Promotion } from './Promotion';

// matchup order is [lower, upper] with anchorId = upper. Presented as a plain VS — the tier
// seam the engine used to pick the pair is intentionally NOT revealed to the player.
describe('Promotion', () => {
  it('crowns whichever side is picked', async () => {
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

    expect(screen.getByRole('heading', { name: /which one wins\?/i })).toBeInTheDocument();
    // No tier is leaked into the UI.
    expect(screen.queryByText(/a-tier|deserve/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: lower.igdbId, loserId: upper.igdbId },
      ]),
    );
  });

  it('crowns the upper game on touch', async () => {
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
