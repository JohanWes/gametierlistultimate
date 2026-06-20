import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComparisonResult } from '@/lib/compare-client';
import { resetStore, useStore } from '@/lib/store';
import { jsonFetch } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen } from '@/test/helpers/render';

import { CommunityComparison } from './CommunityComparison';

const playSound = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sound', () => ({ playSound }));

const tiers = { S: [1], A: [], B: [], C: [], D: [], E: [], F: [2] };
const games = [
  { igdbId: 1, title: 'Pokémon Red', coverUrl: 'https://img/1.jpg' },
  { igdbId: 2, title: 'Elden Ring', coverUrl: 'https://img/2.jpg' },
];

const result: ComparisonResult = {
  similarityPercent: 92,
  sampleSize: 1204,
  outliers: [
    { gameId: 1, userTier: 'S', communityTier: 'C', direction: 'higher' },
    { gameId: 2, userTier: 'F', communityTier: 'S', direction: 'lower' },
  ],
};

function renderPanel(overrides: Partial<ComparisonResult> = {}) {
  return renderWithProviders(
    <CommunityComparison
      tiers={tiers as never}
      games={games}
      fetchImpl={jsonFetch({ ...result, ...overrides })}
      animateCount={false}
    />,
  );
}

beforeEach(() => {
  resetStore();
  playSound.mockClear();
});

describe('CommunityComparison', () => {
  it('shows the similarity percentage, verdict, and sample size', async () => {
    renderPanel();
    expect(await screen.findByText('92')).toBeInTheDocument();
    expect(screen.getByText('Crowd-certified')).toBeInTheDocument();
    expect(screen.getByText(/based on 1,204 lists/)).toBeInTheDocument();
  });

  it('reveals the outlier "hot takes" with both tiers on click', async () => {
    renderPanel();
    const plate = await screen.findByRole('button', { name: /You match 92% of players/ });
    fireEvent.click(plate);

    expect(await screen.findByText('Your hot takes')).toBeInTheDocument();
    expect(screen.getByText('Pokémon Red')).toBeInTheDocument();
    expect(screen.getByText('Elden Ring')).toBeInTheDocument();
    // Direction is conveyed for assistive tech, not just the arrow glyph.
    expect(screen.getByText('You ranked it higher than the crowd.')).toBeInTheDocument();
    expect(screen.getByText('You ranked it lower than the crowd.')).toBeInTheDocument();
  });

  it('opens the drawer on touch as well as click', async () => {
    renderPanel();
    const plate = await screen.findByRole('button', { name: /You match 92%/ });
    fireEvent.touchEnd(plate);
    expect(await screen.findByText('Your hot takes')).toBeInTheDocument();
  });

  it('shows a graceful low-data state when there is no community data', async () => {
    renderPanel({ similarityPercent: null, outliers: [], sampleSize: 0 });
    expect(await screen.findByText(/Not enough lists yet to compare/)).toBeInTheDocument();
    expect(screen.queryByText('%')).not.toBeInTheDocument();
  });

  it('plays one reveal cue when sound is on', async () => {
    renderPanel();
    await screen.findByText('92');
    expect(playSound).toHaveBeenCalledWith('reveal');
  });

  it('stays silent when muted', async () => {
    useStore.getState().setSoundOn(false);
    renderPanel();
    await screen.findByText('92');
    expect(playSound).not.toHaveBeenCalled();
  });
});
