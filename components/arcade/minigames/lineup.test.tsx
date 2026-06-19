import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Lineup } from './Lineup';

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

/**
 * The lineup must have a real, non-drag mobile path: tap cards in favorite→least order into
 * numbered slots, then lock it in. These tests exercise that tap fallback exclusively.
 */
describe('Lineup — tap-to-order fallback', () => {
  it('orders by tap sequence and emits a lineup outcome', async () => {
    const games = makeGames(5);
    const onComplete = vi.fn();
    renderWithProviders(<Lineup games={games} onComplete={onComplete} />);

    // Tap in a non-trivial favourite→least order.
    for (const id of [2, 1, 4, 5, 3]) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Game ${id}$`, 'i') }));
    }

    // Only once every card is placed does the lock-in appear.
    const lock = await screen.findByRole('button', { name: /lock in ranking/i });
    fireEvent.click(lock);

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([{ type: 'lineup', orderedIds: [2, 1, 4, 5, 3] }]),
    );
  });

  it('places via touch and supports removing a placed card', async () => {
    const games = makeGames(5);
    const onComplete = vi.fn();
    renderWithProviders(<Lineup games={games} onComplete={onComplete} />);

    for (const id of [1, 2, 3, 4, 5]) {
      fireEvent.touchEnd(screen.getByRole('button', { name: new RegExp(`^Game ${id}$`, 'i') }));
    }

    // Remove Game 1 (was rank 1) — it returns to the pool, so lock-in disappears.
    fireEvent.click(screen.getByRole('button', { name: /remove game 1/i }));
    expect(screen.queryByRole('button', { name: /lock in ranking/i })).not.toBeInTheDocument();

    // Re-place it last, then lock in.
    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /lock in ranking/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([{ type: 'lineup', orderedIds: [2, 3, 4, 5, 1] }]),
    );
  });

  it('drags an unplaced card into a specific rank slot', async () => {
    const games = makeGames(5);
    const onComplete = vi.fn();
    renderWithProviders(<Lineup games={games} onComplete={onComplete} />);

    const card = screen.getByRole('button', { name: /^Game 3$/i });
    const firstSlot = screen.getByTestId('lineup-slot-1');
    stubRect(firstSlot, { top: 100, bottom: 240, left: 20, right: 124 });

    fireEvent(card, pointerEvent('pointerdown', { clientX: 300, clientY: 420 }));
    fireEvent(card, pointerEvent('pointermove', { clientX: 288, clientY: 400 }));
    fireEvent(card, pointerEvent('pointerup', { clientX: 70, clientY: 160 }));

    for (const id of [1, 2, 4, 5]) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Game ${id}$`, 'i') }));
    }

    fireEvent.click(await screen.findByRole('button', { name: /lock in ranking/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([{ type: 'lineup', orderedIds: [3, 1, 2, 4, 5] }]),
    );
  });
});
