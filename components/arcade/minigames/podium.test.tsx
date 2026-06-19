import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Podium } from './Podium';

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

describe('Podium', () => {
  it('emits the ordered top three plus a pick over the rest', async () => {
    const games = makeGames(6);
    const onComplete = vi.fn();
    renderWithProviders(<Podium games={games} onComplete={onComplete} />);

    // Crown 2 (gold), 5 (silver), 1 (bronze).
    fireEvent.click(screen.getByRole('button', { name: /^Game 2$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 5$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));

    fireEvent.click(screen.getByRole('button', { name: /lock in podium/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'lineup', orderedIds: [2, 5, 1] },
        { type: 'pick-k-of-n', pickedIds: [2, 5, 1], rejectedIds: [3, 4, 6] },
      ]),
    );
  });

  it('only offers lock-in once three are chosen', () => {
    const games = makeGames(6);
    renderWithProviders(<Podium games={games} onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 2$/i }));
    expect(screen.queryByRole('button', { name: /lock in podium/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Game 3$/i }));
    expect(screen.getByRole('button', { name: /lock in podium/i })).toBeInTheDocument();
  });

  it('locks after lock-in (no double emit)', async () => {
    const games = makeGames(6);
    const onComplete = vi.fn();
    renderWithProviders(<Podium games={games} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 2$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 3$/i }));

    const button = screen.getByRole('button', { name: /lock in podium/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('drags a cover directly onto a podium rank', async () => {
    const games = makeGames(6);
    const onComplete = vi.fn();
    renderWithProviders(<Podium games={games} onComplete={onComplete} />);

    const card = screen.getByRole('button', { name: /^Game 5$/i });
    const silver = screen.getByTestId('podium-step-2');
    stubRect(silver, { top: 100, bottom: 300, left: 20, right: 124 });

    fireEvent(card, pointerEvent('pointerdown', { clientX: 300, clientY: 420 }));
    fireEvent(card, pointerEvent('pointermove', { clientX: 288, clientY: 400 }));
    fireEvent(card, pointerEvent('pointerup', { clientX: 70, clientY: 180 }));

    expect(screen.getByRole('button', { name: /remove game 5 from 2nd/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Game 2$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Game 1$/i }));
    fireEvent.click(screen.getByRole('button', { name: /lock in podium/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'lineup', orderedIds: [2, 5, 1] },
        { type: 'pick-k-of-n', pickedIds: [2, 5, 1], rejectedIds: [3, 4, 6] },
      ]),
    );
  });
});
