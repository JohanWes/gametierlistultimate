import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { BucketSort } from './BucketSort';

/** Tap a tray cover to pick it up, then tap a bucket to drop it there. */
function place(gameId: number, bucket: 'top' | 'middle' | 'bottom') {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^place game ${gameId}$`, 'i') }));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${bucket} bucket$`, 'i') }));
}

describe('BucketSort', () => {
  it('sorts covers into ordered buckets and emits one bucket outcome', async () => {
    const games = makeGames(6);
    const onComplete = vi.fn();
    renderWithProviders(<BucketSort games={games} onComplete={onComplete} />);

    place(1, 'top');
    place(2, 'top');
    place(3, 'middle');
    place(4, 'middle');
    place(5, 'bottom');
    place(6, 'bottom');

    fireEvent.click(screen.getByRole('button', { name: /lock in buckets/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        {
          type: 'bucket',
          buckets: [
            [1, 2],
            [3, 4],
            [5, 6],
          ],
        },
      ]),
    );
  });

  it('keeps lock-in unavailable until every cover is placed', () => {
    const games = makeGames(6);
    renderWithProviders(<BucketSort games={games} onComplete={vi.fn()} />);

    place(1, 'top');
    expect(screen.queryByRole('button', { name: /lock in buckets/i })).toBeNull();

    place(2, 'top');
    place(3, 'middle');
    place(4, 'middle');
    place(5, 'bottom');
    place(6, 'bottom');

    expect(screen.getByRole('button', { name: /lock in buckets/i })).not.toBeDisabled();
  });

  it('supports keyboard placement (no mouse dependency)', async () => {
    const games = makeGames(6);
    const onComplete = vi.fn();
    renderWithProviders(<BucketSort games={games} onComplete={onComplete} />);

    const placeByKey = (gameId: number, bucket: string) => {
      fireEvent.keyDown(screen.getByRole('button', { name: new RegExp(`^place game ${gameId}$`, 'i') }), {
        key: 'Enter',
      });
      fireEvent.keyDown(screen.getByRole('button', { name: new RegExp(`^${bucket} bucket$`, 'i') }), {
        key: 'Enter',
      });
    };

    placeByKey(1, 'top');
    placeByKey(2, 'middle');
    placeByKey(3, 'middle');
    placeByKey(4, 'middle');
    placeByKey(5, 'bottom');
    placeByKey(6, 'bottom');

    fireEvent.click(screen.getByRole('button', { name: /lock in buckets/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'bucket', buckets: [[1], [2, 3, 4], [5, 6]] },
      ]),
    );
  });

  it('locks after lock-in (no double emit)', async () => {
    const games = makeGames(6);
    const onComplete = vi.fn();
    renderWithProviders(<BucketSort games={games} onComplete={onComplete} />);

    place(1, 'top');
    place(2, 'top');
    place(3, 'middle');
    place(4, 'middle');
    place(5, 'bottom');
    place(6, 'bottom');

    const button = screen.getByRole('button', { name: /lock in buckets/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
