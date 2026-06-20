import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStore } from '@/lib/store';
import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { PoolStep } from './PoolStep';

function param(url: string, name: string): string | null {
  return new URL(url, 'http://localhost').searchParams.get(name);
}

describe('PoolStep preset shelf handoff', () => {
  beforeEach(() => resetStore());

  it('sends preset=true on the first batches, then stops after 3 accepted games', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      const excluded = (new URL(url, 'http://localhost').searchParams.get('exclude') ?? '')
        .split(',')
        .filter(Boolean);
      const start = 1000 + excluded.length;
      return { ok: true, status: 200, json: async () => ({ games: makeGames(5, start) }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} />);

    // First batch (bootstrap) + backlog prefetch — both preset while cold.
    const playedButtons = await screen.findAllByRole('button', { name: /played it/i });
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));
    expect(param(calls[0], 'preset')).toBe('true');
    expect(param(calls[1], 'preset')).toBe('true');

    // Capture the pass buttons too, then accept 3 distinct slots (0,1,2) and pass slot 3.
    // Each decision pops one from the backlog; the 4th drains it below REFILL_AT and
    // triggers a refill fetch. Captured references stay valid during AnimatePresence exit.
    const passButtons = screen.getAllByRole('button', { name: /pass/i });
    fireEvent.click(playedButtons[0]);
    fireEvent.click(playedButtons[1]);
    fireEvent.click(playedButtons[2]);
    fireEvent.click(passButtons[3]);

    // After 3 accepts, the next fetch must NOT include preset (personalization takes over).
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));
    expect(param(calls[calls.length - 1], 'preset')).toBeNull();
  });

  it('keeps preset=true if the user only passes (no accepts), until the shelf drains', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      const excluded = (new URL(url, 'http://localhost').searchParams.get('exclude') ?? '')
        .split(',')
        .filter(Boolean);
      const start = 1000 + excluded.length;
      return { ok: true, status: 200, json: async () => ({ games: makeGames(5, start) }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} />);

    // Pass 4 distinct slots (no accepts) — drains the backlog and triggers a refill fetch.
    const passButtons = await screen.findAllByRole('button', { name: /pass/i });
    fireEvent.click(passButtons[0]);
    fireEvent.click(passButtons[1]);
    fireEvent.click(passButtons[2]);
    fireEvent.click(passButtons[3]);

    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));

    // Every call so far should still have preset=true (no accepts to trigger handoff).
    for (const url of calls) {
      expect(param(url, 'preset')).toBe('true');
    }
  });
});
