import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sound', () => ({
  playSound: vi.fn(),
  initAudio: vi.fn(),
  setMuted: vi.fn(),
  isMuted: () => false,
}));

import {
  assignTier,
  createRankingState,
  serializeRankingState,
  TIER_ORDER,
  type Tier,
} from '@/lib/ranking';
import { playSound } from '@/lib/sound';
import { resetStore, useStore } from '@/lib/store';
import { makeGames } from '@/test/helpers/games';
import { act, fireEvent, renderWithProviders, screen, within } from '@/test/helpers/render';

import { ResultStep } from './ResultStep';

/** Seed a pool of 7 games, one placed in each tier S→F (game 1 = S … game 7 = F). */
function seed() {
  resetStore();
  const games = makeGames(7);
  const add = useStore.getState().addToPool;
  for (const g of games) add(g, 'finished');
  let state = createRankingState(games.map((g) => ({ gameId: g.igdbId })));
  TIER_ORDER.forEach((tier: Tier, i) => {
    state = assignTier(state, i + 1, tier);
  });
  useStore.getState().setScores(serializeRankingState(state) as unknown as Record<string, unknown>);
  return games;
}

function renderedTierRows(): string[] {
  return screen
    .queryAllByTestId(/^tier-row-/)
    .map((row) => row.getAttribute('data-testid')?.replace('tier-row-', '') ?? '');
}

describe('ResultStep reveal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (playSound as ReturnType<typeof vi.fn>).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a compact ladder from F upward with S last', () => {
    seed();
    renderWithProviders(<ResultStep />);

    // No hidden placeholder rows take up space before the first timer fires.
    expect(renderedTierRows()).toEqual([]);

    act(() => {
      vi.advanceTimersByTime(460);
    });
    // F appears alone at the top of the reveal stack.
    expect(renderedTierRows()).toEqual(['F']);
    expect(within(screen.getByTestId('tier-row-F')).getByText('Game 7')).toBeInTheDocument();
    expect(screen.queryByTestId('tier-row-S')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(460);
    });
    // Each stronger tier appears above the weaker tiers already shown.
    expect(renderedTierRows()).toEqual(['E', 'F']);
    expect(within(screen.getByTestId('tier-row-E')).getByText('Game 6')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // After the full sequence, the board is in its final S→F order.
    expect(renderedTierRows()).toEqual(['S', 'A', 'B', 'C', 'D', 'E', 'F']);
    expect(within(screen.getByTestId('tier-row-S')).getByText('Game 1')).toBeInTheDocument();
  });

  it('plays a reveal cue per row and a success on the S row', () => {
    seed();
    renderWithProviders(<ResultStep />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    const names = (playSound as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(names.filter((n) => n === 'reveal')).toHaveLength(6);
    expect(names[names.length - 1]).toBe('success');
  });

  it('stays silent when muted', () => {
    seed();
    useStore.getState().setSoundOn(false);
    renderWithProviders(<ResultStep />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(playSound).not.toHaveBeenCalled();
  });

  it('reveals everything at once when skipped', () => {
    seed();
    renderWithProviders(<ResultStep />);

    fireEvent.click(screen.getByRole('button', { name: /reveal all/i }));

    expect(within(screen.getByTestId('tier-row-S')).getByText('Game 1')).toBeInTheDocument();
    expect(within(screen.getByTestId('tier-row-F')).getByText('Game 7')).toBeInTheDocument();
  });
});
