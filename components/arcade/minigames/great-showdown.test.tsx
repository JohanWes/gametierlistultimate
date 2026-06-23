import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { GreatShowdown } from './GreatShowdown';

/** Tap the active winner by title, waiting for that bout to become interactive. */
async function crown(title: RegExp) {
  const button = await screen.findByRole('button', { name: title }, { timeout: 4000 });
  fireEvent.click(button);
}

describe('GreatShowdown', () => {
  it('marks only the current desktop bout as active while the matchup advances', async () => {
    const games = makeGames(8);
    const onComplete = vi.fn();
    const { container } = renderWithProviders(
      <GreatShowdown games={games} onComplete={onComplete} />,
    );

    expect(container.querySelector('[data-showdown-bout="QF1"]')).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(container.querySelectorAll('[data-active="true"]')).toHaveLength(1);

    await crown(/^Game 1$/);

    await waitFor(
      () =>
        expect(container.querySelector('[data-showdown-bout="QF2"]')).toHaveAttribute(
          'data-active',
          'true',
        ),
      { timeout: 4000 },
    );
    expect(container.querySelector('[data-showdown-bout="QF1"]')).toHaveAttribute(
      'data-active',
      'false',
    );
    expect(container.querySelectorAll('[data-active="true"]')).toHaveLength(1);
  });

  it('plays nine bouts (quarters, redemption, semis, finale) and emits weighted duels', async () => {
    const games = makeGames(8); // seeds 1..8, quarter pairs (1,2)(3,4)(5,6)(7,8)
    const onComplete = vi.fn();
    renderWithProviders(<GreatShowdown games={games} onComplete={onComplete} />);

    // Always crown the lower id of each active bout.
    await crown(/^Game 1$/); // QF1
    await crown(/^Game 3$/); // QF2
    await crown(/^Game 5$/); // QF3
    await crown(/^Game 7$/); // QF4
    await crown(/^Game 2$/); // Redemption 1 (losers 2 vs 4)
    await crown(/^Game 6$/); // Redemption 2 (losers 6 vs 8)
    await crown(/^Game 1$/); // SF1 (1 vs 3)
    await crown(/^Game 5$/); // SF2 (5 vs 7)
    await crown(/^Game 1$/); // Finale (1 vs 5)

    await waitFor(
      () =>
        expect(onComplete).toHaveBeenCalledWith([
          { type: 'pairwise', winnerId: 1, loserId: 2, weight: 1.0 },
          { type: 'pairwise', winnerId: 3, loserId: 4, weight: 1.0 },
          { type: 'pairwise', winnerId: 5, loserId: 6, weight: 1.0 },
          { type: 'pairwise', winnerId: 7, loserId: 8, weight: 1.0 },
          { type: 'pairwise', winnerId: 2, loserId: 4, weight: 0.9 },
          { type: 'pairwise', winnerId: 6, loserId: 8, weight: 0.9 },
          { type: 'pairwise', winnerId: 1, loserId: 3, weight: 1.25 },
          { type: 'pairwise', winnerId: 5, loserId: 7, weight: 1.25 },
          { type: 'pairwise', winnerId: 1, loserId: 5, weight: 1.5 },
        ]),
      { timeout: 4000 },
    );
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not emit until the finale is decided', async () => {
    const games = makeGames(8);
    const onComplete = vi.fn();
    renderWithProviders(<GreatShowdown games={games} onComplete={onComplete} />);

    await crown(/^Game 1$/); // QF1
    await crown(/^Game 3$/); // QF2
    await crown(/^Game 5$/); // QF3
    await crown(/^Game 7$/); // QF4
    expect(onComplete).not.toHaveBeenCalled();
  });
});
