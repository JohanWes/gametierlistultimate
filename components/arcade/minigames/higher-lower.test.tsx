import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { HigherLower } from './HigherLower';

function renderGauge() {
  const [anchor, challenger] = makeGames(2);
  const onComplete = vi.fn();
  renderWithProviders(
    <HigherLower games={[anchor, challenger]} anchorId={anchor.igdbId} onComplete={onComplete} />,
  );
  return { anchor, challenger, onComplete };
}

function lockPlacement() {
  fireEvent.click(screen.getByRole('button', { name: /lock placement/i }));
}

function pointerEvent(type: string, clientY: number, pointerId = 1): MouseEvent {
  const event = new MouseEvent(type, { clientY, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

function stubGaugeRect(height = 100): HTMLElement {
  const gauge = screen.getByRole('slider', { name: /place game 2 against game 1/i });
  gauge.getBoundingClientRect = (() =>
    ({
      top: 0,
      left: 0,
      right: 96,
      bottom: height,
      width: 96,
      height,
      x: 0,
      y: 0,
      toJSON: () => {},
    }) as DOMRect) as typeof gauge.getBoundingClientRect;
  return gauge;
}

describe('HigherLower', () => {
  it('"Above" makes the challenger win against the benchmark', async () => {
    const { anchor, challenger, onComplete } = renderGauge();

    fireEvent.click(screen.getByRole('button', { name: /^above$/i }));
    lockPlacement();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: challenger.igdbId, loserId: anchor.igdbId },
      ]),
    );
  });

  it('"Below" makes the benchmark win via touch', async () => {
    const { anchor, challenger, onComplete } = renderGauge();

    fireEvent.touchEnd(screen.getByRole('button', { name: /^below$/i }));
    fireEvent.touchEnd(screen.getByRole('button', { name: /lock placement/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: anchor.igdbId, loserId: challenger.igdbId },
      ]),
    );
  });

  it('"Same shelf" emits an about-equal nudge', async () => {
    const { anchor, challenger, onComplete } = renderGauge();

    fireEvent.click(screen.getByRole('button', { name: /same shelf/i }));
    lockPlacement();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'about-equal', gameIds: [challenger.igdbId, anchor.igdbId] },
      ]),
    );
  });

  it('weights the extreme placements', async () => {
    const { anchor, challenger, onComplete } = renderGauge();

    fireEvent.click(screen.getByRole('button', { name: /crushes it/i }));
    lockPlacement();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        {
          type: 'pairwise',
          winnerId: challenger.igdbId,
          loserId: anchor.igdbId,
          weight: 1.35,
        },
      ]),
    );
  });

  it('weights the buried placement for the benchmark', async () => {
    const { anchor, challenger, onComplete } = renderGauge();

    fireEvent.click(screen.getByRole('button', { name: /buried/i }));
    lockPlacement();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        {
          type: 'pairwise',
          winnerId: anchor.igdbId,
          loserId: challenger.igdbId,
          weight: 1.35,
        },
      ]),
    );
  });

  it('supports dragging the gauge to choose a placement', async () => {
    const { anchor, challenger, onComplete } = renderGauge();
    const gauge = stubGaugeRect();

    fireEvent(gauge, pointerEvent('pointerdown', 100));
    fireEvent(gauge, pointerEvent('pointermove', 100));
    fireEvent(gauge, pointerEvent('pointerup', 100));
    lockPlacement();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        {
          type: 'pairwise',
          winnerId: anchor.igdbId,
          loserId: challenger.igdbId,
          weight: 1.35,
        },
      ]),
    );
  });

  it('disables lock-in until a placement is selected', () => {
    renderGauge();

    const button = screen.getByRole('button', { name: /lock placement/i });
    expect(button).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /^above$/i }));
    expect(button).not.toBeDisabled();
  });

  it('"Skip" emits a skip', async () => {
    const { anchor, challenger, onComplete } = renderGauge();

    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'skip', gameIds: [challenger.igdbId, anchor.igdbId] },
      ]),
    );
  });

  it('locks after completion so it cannot emit twice', async () => {
    const { onComplete } = renderGauge();

    fireEvent.click(screen.getByRole('button', { name: /^above$/i }));
    lockPlacement();
    lockPlacement();

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
