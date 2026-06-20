import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { VibeMeter } from './VibeMeter';

/**
 * jsdom has no `PointerEvent` constructor, so RTL's `fireEvent.pointerDown` produces a clientY-less
 * event. We build a `MouseEvent` typed as `pointerdown`/`pointermove`/`pointerup` instead — jsdom
 * dispatches it, React routes it to the `onPointerDown` handler, and `clientY` is preserved.
 */
function pointerEvent(type: string, clientY: number, pointerId = 1): MouseEvent {
  const event = new MouseEvent(type, { clientY, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

/** jsdom reports zero-height rects; stub the meter's rect so clientY maps to a real position. */
function stubMeterRect(label: RegExp, height = 100): HTMLElement {
  const meter = screen.getByRole('slider', { name: label });
  meter.getBoundingClientRect = (() =>
    ({
      top: 0,
      left: 0,
      right: 40,
      bottom: height,
      width: 40,
      height,
      x: 0,
      y: 0,
      toJSON: () => {},
    }) as DOMRect) as typeof meter.getBoundingClientRect;
  return meter;
}

/**
 * clientY → score for height=100. The meter maps position (0 top → 1 bottom) to score
 * (100 top → 0 bottom), so score = 100 - clientY. The tier is derived by snapping the
 * score to the nearest of the 7 internal tier bands: score 95→S, 80→A, 65→B, 50→C, 35→D, 20→E, 5→F.
 */
const TIER_FOR_SCORE: Record<string, string> = { 95: 'S', 80: 'A', 65: 'B', 50: 'C', 35: 'D', 20: 'E', 5: 'F' };

function dragToScore(meter: HTMLElement, score: number, pointerId = 1) {
  const y = 100 - score;
  fireEvent(meter, pointerEvent('pointerdown', y, pointerId));
  fireEvent(meter, pointerEvent('pointermove', y, pointerId));
  fireEvent(meter, pointerEvent('pointerup', y, pointerId));
}

describe('VibeMeter', () => {
  it('renders a meter for each game', () => {
    const games = makeGames(4);
    renderWithProviders(<VibeMeter games={games} onComplete={vi.fn()} />);

    expect(screen.getByRole('slider', { name: /rate game 1/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /rate game 2/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /rate game 3/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /rate game 4/i })).toBeInTheDocument();
  });

  it('emits one vibe outcome per game on lock-in after all meters are set', async () => {
    const [a, b, c, d] = makeGames(4);
    const onComplete = vi.fn();
    renderWithProviders(<VibeMeter games={[a, b, c, d]} onComplete={onComplete} />);

    dragToScore(stubMeterRect(/rate game 1/i), 95);
    dragToScore(stubMeterRect(/rate game 2/i), 80);
    dragToScore(stubMeterRect(/rate game 3/i), 50);
    dragToScore(stubMeterRect(/rate game 4/i), 5);

    fireEvent.click(screen.getByRole('button', { name: /lock in vibes/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'vibe', gameId: a.igdbId, score: 95, tier: TIER_FOR_SCORE[95] },
        { type: 'vibe', gameId: b.igdbId, score: 80, tier: TIER_FOR_SCORE[80] },
        { type: 'vibe', gameId: c.igdbId, score: 50, tier: TIER_FOR_SCORE[50] },
        { type: 'vibe', gameId: d.igdbId, score: 5, tier: TIER_FOR_SCORE[5] },
      ]),
    );
  });

  it('works with touch pointer events', async () => {
    const [a, b] = makeGames(2);
    const onComplete = vi.fn();
    renderWithProviders(<VibeMeter games={[a, b]} onComplete={onComplete} />);

    const meter1 = stubMeterRect(/rate game 1/i);
    const meter2 = stubMeterRect(/rate game 2/i);

    const touchEvent = (type: string, clientY: number, pointerId: number): MouseEvent => {
      const event = new MouseEvent(type, { clientY, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'pointerId', { value: pointerId });
      Object.defineProperty(event, 'pointerType', { value: 'touch' });
      return event;
    };

    fireEvent(meter1, touchEvent('pointerdown', 5, 2));
    fireEvent(meter1, touchEvent('pointermove', 5, 2));
    fireEvent(meter1, touchEvent('pointerup', 5, 2));

    fireEvent(meter2, touchEvent('pointerdown', 95, 3));
    fireEvent(meter2, touchEvent('pointermove', 95, 3));
    fireEvent(meter2, touchEvent('pointerup', 95, 3));

    fireEvent.click(screen.getByRole('button', { name: /lock in vibes/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'vibe', gameId: a.igdbId, score: 95, tier: TIER_FOR_SCORE[95] },
        { type: 'vibe', gameId: b.igdbId, score: 5, tier: TIER_FOR_SCORE[5] },
      ]),
    );
  });

  it('disables lock-in until every game is rated', () => {
    const [a, b, c, d] = makeGames(4);
    renderWithProviders(<VibeMeter games={[a, b, c, d]} onComplete={vi.fn()} />);

    const button = screen.getByRole('button', { name: /lock in vibes/i });
    expect(button).toBeDisabled();

    dragToScore(stubMeterRect(/rate game 1/i), 95);
    expect(button).toBeDisabled();

    dragToScore(stubMeterRect(/rate game 2/i), 65);
    dragToScore(stubMeterRect(/rate game 3/i), 35);
    dragToScore(stubMeterRect(/rate game 4/i), 5);
    expect(button).not.toBeDisabled();
  });

  it('locks after lock-in (no double emit)', async () => {
    const [a] = makeGames(1);
    const onComplete = vi.fn();
    renderWithProviders(<VibeMeter games={[a]} onComplete={onComplete} />);

    dragToScore(stubMeterRect(/rate game 1/i), 65);

    const button = screen.getByRole('button', { name: /lock in vibes/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
});
