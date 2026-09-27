import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import {
  fireEvent,
  preferReducedMotion,
  renderWithProviders,
  screen,
  waitFor,
} from '@/test/helpers/render';

import { GreatShowdown } from './GreatShowdown';

preferReducedMotion();

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

  it('shows the redemption pop-up only while a redemption bout is live', async () => {
    const games = makeGames(8);
    const onComplete = vi.fn();
    const { container } = renderWithProviders(
      <GreatShowdown games={games} onComplete={onComplete} />,
    );

    // During the quarters there is no redemption overlay.
    expect(container.querySelector('[data-showdown-redemption-overlay]')).toBeNull();

    await crown(/^Game 1$/); // QF1
    await crown(/^Game 3$/); // QF2
    await crown(/^Game 5$/); // QF3
    await crown(/^Game 7$/); // QF4

    // Quarters done → redemption pops up, with exactly one active bout (R1).
    await waitFor(
      () => expect(container.querySelector('[data-showdown-redemption-overlay]')).not.toBeNull(),
      { timeout: 4000 },
    );
    expect(container.querySelectorAll('[data-active="true"]')).toHaveLength(1);
    expect(container.querySelector('[data-showdown-bout="R1"]')).toHaveAttribute(
      'data-active',
      'true',
    );

    // Resolve both redemption duels → overlay dissolves and a semifinal takes over.
    await crown(/^Game 2$/); // R1
    await crown(/^Game 6$/); // R2
    await waitFor(
      () => expect(container.querySelector('[data-showdown-redemption-overlay]')).toBeNull(),
      { timeout: 4000 },
    );
    expect(container.querySelector('[data-showdown-bout="SF1"]')).toHaveAttribute(
      'data-active',
      'true',
    );
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
