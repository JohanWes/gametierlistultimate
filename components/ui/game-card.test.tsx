import { describe, expect, it, vi } from 'vitest';

import type { Game } from '@/lib/games/types';
import { fireEvent, renderWithProviders, screen } from '@/test/helpers/render';

import { GameCard } from './GameCard';

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    igdbId: 42,
    title: 'Hollow Knight',
    coverUrl: 'https://images.example/cover.jpg',
    genres: [],
    platforms: [],
    releaseYear: null,
    popularity: null,
    rating: null,
    summary: null,
    hasCover: true,
    category: null,
    ...overrides,
  };
}

describe('GameCard', () => {
  it('renders the cover image and title', () => {
    renderWithProviders(<GameCard game={makeGame()} />);
    const img = screen.getByRole('img', { name: 'Hollow Knight' });
    expect(img).toHaveAttribute('src', 'https://images.example/cover.jpg');
    expect(screen.getAllByText('Hollow Knight').length).toBeGreaterThan(0);
  });

  it('upgrades stale IGDB cover URLs at render time', () => {
    renderWithProviders(
      <GameCard
        game={makeGame({
          coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7f.jpg',
        })}
      />,
    );
    expect(screen.getByRole('img', { name: 'Hollow Knight' })).toHaveAttribute(
      'src',
      'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1r7f.jpg',
    );
  });

  it('shows a title fallback when there is no cover', () => {
    renderWithProviders(<GameCard game={makeGame({ hasCover: false, coverUrl: null })} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Hollow Knight')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    renderWithProviders(<GameCard loading />);
    expect(screen.getByTestId('game-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('fires onSelect on click', () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <GameCard game={makeGame({ hasCover: false, coverUrl: null })} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ igdbId: 42 }));
  });

  it('fires onSelect on touch', () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <GameCard game={makeGame({ hasCover: false, coverUrl: null })} onSelect={onSelect} />,
    );
    fireEvent.touchEnd(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('is non-interactive (no button) without onSelect', () => {
    renderWithProviders(<GameCard game={makeGame()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
