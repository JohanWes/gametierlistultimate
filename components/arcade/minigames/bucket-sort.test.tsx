import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { BucketSort } from './BucketSort';

/** Tap a tray cover to pick it up, then tap a bucket to drop it there. */
function place(gameId: number, bucket: 'top' | 'middle' | 'bottom') {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^place game ${gameId}$`, 'i') }));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${bucket} bucket$`, 'i') }));
}

function pointerEvent(
  type: string,
  point: { clientX: number; clientY: number },
  pointerId = 1,
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: point.clientX,
    clientY: point.clientY,
    button: 0,
  });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  return event;
}

function stubRect(
  el: HTMLElement,
  rect: { top: number; bottom: number; left: number; right: number },
) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      ...rect,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      x: rect.left,
      y: rect.top,
      toJSON: () => rect,
    }),
  });
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

  it('drags a cover into a bucket with pointer events', () => {
    const games = makeGames(6);
    renderWithProviders(<BucketSort games={games} onComplete={vi.fn()} />);

    const card = screen.getByRole('button', { name: /^place game 1$/i });
    const top = screen.getByRole('button', { name: /^top bucket$/i });
    stubRect(top, { top: 100, bottom: 300, left: 20, right: 220 });

    fireEvent(card, pointerEvent('pointerdown', { clientX: 40, clientY: 420 }));
    fireEvent(card, pointerEvent('pointermove', { clientX: 48, clientY: 400 }));
    fireEvent(card, pointerEvent('pointerup', { clientX: 100, clientY: 180 }));

    expect(screen.getByRole('button', { name: /^remove game 1 from top$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^place game 1$/i })).toBeNull();
  });

  it('treats a below-threshold pointer move as a tap', () => {
    const games = makeGames(6);
    renderWithProviders(<BucketSort games={games} onComplete={vi.fn()} />);

    const card = screen.getByRole('button', { name: /^place game 1$/i });
    fireEvent(card, pointerEvent('pointerdown', { clientX: 40, clientY: 420 }));
    fireEvent(card, pointerEvent('pointermove', { clientX: 43, clientY: 422 }));
    fireEvent(card, pointerEvent('pointerup', { clientX: 43, clientY: 422 }));

    expect(screen.getByText(/now tap a bucket/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^top bucket$/i }));
    expect(screen.getByRole('button', { name: /^remove game 1 from top$/i })).toBeInTheDocument();
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
