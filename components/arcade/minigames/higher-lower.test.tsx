import { describe, expect, it, vi } from 'vitest';

import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { HigherLower, outcomeForBands } from './HigherLower';

const [ANCHOR, CHALLENGER] = makeGames(2);
// anchor = Game 1 (igdbId 1), challenger = Game 2 (igdbId 2)
// Bands: 0 = Bad, 1 = Mid, 2 = Great (higher index = better)

function renderScale() {
  const onComplete = vi.fn();
  renderWithProviders(
    <HigherLower
      games={[ANCHOR, CHALLENGER]}
      anchorId={ANCHOR.igdbId}
      onComplete={onComplete}
    />,
  );
  return { onComplete };
}

/** Tap a tray cover to arm it, then tap a band to drop it there. */
function placeByTap(gameTitle: string, bandLabel: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^place ${gameTitle}$`, 'i') }));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${bandLabel} band$`, 'i') }));
}

function lockIn() {
  fireEvent.click(screen.getByRole('button', { name: /lock in placement/i }));
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

describe('outcomeForBands (pure mapping)', () => {
  it('same band emits about-equal, ordered [challenger, anchor]', () => {
    expect(outcomeForBands(ANCHOR, CHALLENGER, 1, 1)).toEqual({
      type: 'about-equal',
      gameIds: [CHALLENGER.igdbId, ANCHOR.igdbId],
    });
  });

  it('one band apart: challenger better → challenger wins, normal weight', () => {
    expect(outcomeForBands(ANCHOR, CHALLENGER, 0, 1)).toEqual({
      type: 'pairwise',
      winnerId: CHALLENGER.igdbId,
      loserId: ANCHOR.igdbId,
    });
  });

  it('one band apart: anchor better → anchor wins, normal weight', () => {
    expect(outcomeForBands(ANCHOR, CHALLENGER, 2, 1)).toEqual({
      type: 'pairwise',
      winnerId: ANCHOR.igdbId,
      loserId: CHALLENGER.igdbId,
    });
  });

  it('two bands apart (Bad vs Great) applies the strong weight', () => {
    expect(outcomeForBands(ANCHOR, CHALLENGER, 0, 2)).toEqual({
      type: 'pairwise',
      winnerId: CHALLENGER.igdbId,
      loserId: ANCHOR.igdbId,
      weight: 1.35,
    });
  });

  it('the reverse landslide weights the anchor', () => {
    expect(outcomeForBands(ANCHOR, CHALLENGER, 2, 0)).toEqual({
      type: 'pairwise',
      winnerId: ANCHOR.igdbId,
      loserId: CHALLENGER.igdbId,
      weight: 1.35,
    });
  });
});

describe('HigherLower (the scale)', () => {
  it('same band → about-equal', async () => {
    const { onComplete } = renderScale();

    placeByTap('Game 2', 'Mid');
    placeByTap('Game 1', 'Mid');
    lockIn();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'about-equal', gameIds: [CHALLENGER.igdbId, ANCHOR.igdbId] },
      ]),
    );
  });

  it('adjacent bands → challenger wins with normal weight', async () => {
    const { onComplete } = renderScale();

    placeByTap('Game 2', 'Great');
    placeByTap('Game 1', 'Mid');
    lockIn();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: CHALLENGER.igdbId, loserId: ANCHOR.igdbId },
      ]),
    );
  });

  it('two bands apart (Bad vs Great) → strong weight', async () => {
    const { onComplete } = renderScale();

    placeByTap('Game 2', 'Great');
    placeByTap('Game 1', 'Bad');
    lockIn();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        {
          type: 'pairwise',
          winnerId: CHALLENGER.igdbId,
          loserId: ANCHOR.igdbId,
          weight: 1.35,
        },
      ]),
    );
  });

  it('anchor in the better band → anchor wins', async () => {
    const { onComplete } = renderScale();

    placeByTap('Game 1', 'Great');
    placeByTap('Game 2', 'Bad');
    lockIn();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        {
          type: 'pairwise',
          winnerId: ANCHOR.igdbId,
          loserId: CHALLENGER.igdbId,
          weight: 1.35,
        },
      ]),
    );
  });

  it('two covers in the same band sit next to each other', () => {
    renderScale();

    placeByTap('Game 2', 'Mid');
    placeByTap('Game 1', 'Mid');

    expect(screen.getByRole('button', { name: /remove game 2 from mid/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove game 1 from mid/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^place game 1$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^place game 2$/i })).toBeNull();
  });

  it('tap a placed cover to send it back to the tray', () => {
    renderScale();

    placeByTap('Game 2', 'Mid');
    expect(screen.queryByRole('button', { name: /^place game 2$/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /remove game 2 from mid/i }));
    expect(screen.getByRole('button', { name: /^place game 2$/i })).toBeInTheDocument();
  });

  it('drags a cover onto a band with pointer events', async () => {
    const { onComplete } = renderScale();

    const card = screen.getByRole('button', { name: /^place game 2$/i });
    const band = screen.getByRole('button', { name: /^great band$/i });
    stubRect(band, { top: 10, bottom: 200, left: 450, right: 670 });

    fireEvent(card, pointerEvent('pointerdown', { clientX: 100, clientY: 420 }));
    fireEvent(card, pointerEvent('pointermove', { clientX: 108, clientY: 400 }));
    fireEvent(card, pointerEvent('pointerup', { clientX: 560, clientY: 100 }));

    expect(screen.getByRole('button', { name: /remove game 2 from great/i })).toBeInTheDocument();

    // Place the anchor by tap, then lock in.
    placeByTap('Game 1', 'Mid');
    lockIn();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: CHALLENGER.igdbId, loserId: ANCHOR.igdbId },
      ]),
    );
  });

  it('lock-in stays disabled until both covers are placed', () => {
    renderScale();

    expect(screen.getByRole('button', { name: /lock in placement/i })).toBeDisabled();

    placeByTap('Game 2', 'Mid');
    expect(screen.getByRole('button', { name: /lock in placement/i })).toBeDisabled();

    placeByTap('Game 1', 'Mid');
    expect(screen.getByRole('button', { name: /lock in placement/i })).not.toBeDisabled();
  });

  it('skip emits a skip for both games', async () => {
    const { onComplete } = renderScale();

    fireEvent.click(screen.getByRole('button', { name: /^skip$/i }));

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'skip', gameIds: [CHALLENGER.igdbId, ANCHOR.igdbId] },
      ]),
    );
  });

  it('locks after completion so it cannot emit twice', async () => {
    const { onComplete } = renderScale();

    placeByTap('Game 2', 'Mid');
    placeByTap('Game 1', 'Mid');
    lockIn();
    lockIn();

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });

  it('shows a live readout explaining the current placement', () => {
    renderScale();

    // Before any placement, it prompts for the next game.
    expect(screen.getByText(/now place game/i)).toBeInTheDocument();

    placeByTap('Game 2', 'Great');
    placeByTap('Game 1', 'Mid');

    // Both placed, adjacent → "Game 2 wins — Great vs Mid".
    expect(screen.getByText(/game 2 wins — great vs mid/i)).toBeInTheDocument();
  });

  it('handles games given in either order via anchorId', async () => {
    const onComplete = vi.fn();
    // Pass challenger first, but anchorId still identifies the anchor.
    renderWithProviders(
      <HigherLower
        games={[CHALLENGER, ANCHOR]}
        anchorId={ANCHOR.igdbId}
        onComplete={onComplete}
      />,
    );

    placeByTap('Game 1', 'Great');
    placeByTap('Game 2', 'Mid');
    lockIn();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: ANCHOR.igdbId, loserId: CHALLENGER.igdbId },
      ]),
    );
  });
});

describe('HigherLower edge cases', () => {
  it('renders nothing with fewer than two games', () => {
    const { container } = renderWithProviders(
      <HigherLower games={[ANCHOR]} anchorId={ANCHOR.igdbId} onComplete={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('falls back to games[0] as anchor when anchorId is absent', async () => {
    const onComplete = vi.fn();
    const [g1, g2] = makeGames(2);
    renderWithProviders(<HigherLower games={[g1, g2]} onComplete={onComplete} />);

    // g1 is anchor (games[0]); placing g2 above g1 makes g2 win.
    placeByTap('Game 2', 'Great');
    placeByTap('Game 1', 'Mid');
    lockIn();

    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith([
        { type: 'pairwise', winnerId: g2.igdbId, loserId: g1.igdbId },
      ]),
    );
  });
});
