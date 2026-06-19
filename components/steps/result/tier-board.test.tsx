import { describe, expect, it } from 'vitest';

import { TIER_ORDER, type TierMap } from '@/lib/ranking';
import { makeGame } from '@/test/helpers/games';
import { renderWithProviders, screen, within } from '@/test/helpers/render';

import { TierBoard } from './TierBoard';

const games = [
  makeGame({ igdbId: 1, title: 'Alpha' }),
  makeGame({ igdbId: 2, title: 'Bravo' }),
  makeGame({ igdbId: 3, title: 'Charlie' }),
];
const gamesById = new Map(games.map((g) => [g.igdbId, g]));
const tiers: TierMap = { S: [1], A: [], B: [2, 3], C: [], D: [], E: [], F: [] };

describe('TierBoard (read-only)', () => {
  it('renders all seven tier rows', () => {
    renderWithProviders(<TierBoard tiers={tiers} gamesById={gamesById} />);
    for (const tier of TIER_ORDER) {
      expect(screen.getByTestId(`tier-row-${tier}`)).toBeInTheDocument();
    }
  });

  it('places each cover in the tier the data assigns it to', () => {
    renderWithProviders(<TierBoard tiers={tiers} gamesById={gamesById} />);
    expect(within(screen.getByTestId('tier-row-S')).getByText('Alpha')).toBeInTheDocument();
    expect(within(screen.getByTestId('tier-row-B')).getByText('Bravo')).toBeInTheDocument();
    expect(within(screen.getByTestId('tier-row-B')).getByText('Charlie')).toBeInTheDocument();
  });

  it('renders an empty tier row cleanly', () => {
    renderWithProviders(<TierBoard tiers={tiers} gamesById={gamesById} />);
    const rowA = screen.getByTestId('tier-row-A');
    expect(within(rowA).queryByText('Alpha')).not.toBeInTheDocument();
    expect(within(rowA).queryByText('Bravo')).not.toBeInTheDocument();
  });
});
