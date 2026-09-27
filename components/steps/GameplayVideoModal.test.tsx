import { describe, expect, it } from 'vitest';

import { mockFetch } from '@/test/helpers/fetch';
import { makeGame } from '@/test/helpers/games';
import { renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { GameplayVideoModal, type VideoTarget } from './GameplayVideoModal';

const game = makeGame({ igdbId: 42, title: 'Hollow Knight' });
const target: VideoTarget = {
  game,
  rect: { left: 0, top: 0, width: 120, height: 160 } as DOMRect,
};

describe('GameplayVideoModal', () => {
  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(
      <GameplayVideoModal video={null} onClose={() => {}} />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('embeds the resolved video in a youtube-nocookie iframe', async () => {
    mockFetch(() => ({ videoId: 'ABC12345678' }));
    const { container } = renderWithProviders(
      <GameplayVideoModal video={target} onClose={() => {}} />,
    );

    await waitFor(() => {
      const iframe = container.querySelector('iframe');
      expect(iframe).not.toBeNull();
      expect(iframe?.getAttribute('src')).toContain(
        'https://www.youtube-nocookie.com/embed/ABC12345678',
      );
    });
  });

  it('shows a YouTube search fallback link when nothing resolves', async () => {
    mockFetch(() => ({ videoId: null }));
    renderWithProviders(<GameplayVideoModal video={target} onClose={() => {}} />);

    const link = await screen.findByRole('link', { name: /watch gameplay on youtube/i });
    expect(link.getAttribute('href')).toContain(
      encodeURIComponent('Hollow Knight full gameplay walkthrough'),
    );
  });
});
