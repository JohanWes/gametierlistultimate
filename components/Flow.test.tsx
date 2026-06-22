import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetStarterBatchPrefetch } from '@/lib/games/prefetch';
import { resetStore, useStore } from '@/lib/store';
import { makeGames } from '@/test/helpers/games';
import { mswServer } from '@/test/helpers/msw';
import { act, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { Flow } from './Flow';

describe('Flow keep-alive', () => {
  beforeEach(() => {
    resetStore();
    resetStarterBatchPrefetch();
  });

  afterEach(() => {
    resetStarterBatchPrefetch();
  });

  it('keeps PoolStep mounted when toggling between steps 2 and 3 (no re-fetch)', async () => {
    let calls = 0;
    mswServer.use(
      http.get(/\/api\/games\/suggestions/, () => {
        calls += 1;
        return HttpResponse.json({ games: makeGames(3, calls * 1000) });
      }),
    );

    // Hydrate at the pool step so PoolStep mounts on first render.
    act(() => {
      useStore.getState().setHydrated(true);
      useStore.getState().setStep('pool');
    });

    renderWithProviders(<Flow />);

    // Wait for the first batch + backlog prefetch to settle (2 calls: bootstrap + ensureBacklog).
    await screen.findAllByRole('button', { name: /played it/i });
    await waitFor(() => expect(calls).toBe(2));
    const callsAfterFirstVisit = calls;

    // Navigate to onboarding — PoolStep should be hidden, not unmounted.
    act(() => {
      useStore.getState().setStep('onboarding');
    });
    // Wait for OnboardingStep to mount (visited effect adds it).
    await waitFor(() => {
      expect(screen.getByText(/Step 2 · Preferences/i)).toBeInTheDocument();
    });
    // PoolStep's buttons should be inaccessible (hidden attribute → display:none) but
    // the content stays in the DOM — that's the keep-alive guarantee.
    expect(screen.queryByRole('button', { name: /played it/i })).toBeNull();

    // Navigate back to pool — PoolStep should reappear without re-fetching.
    act(() => {
      useStore.getState().setStep('pool');
    });
    await screen.findAllByRole('button', { name: /played it/i });

    // Give any potential re-bootstrap a chance to fire (it shouldn't).
    await new Promise((r) => setTimeout(r, 150));
    expect(calls).toBe(callsAfterFirstVisit);
  });

  it('does not mount a step the user skipped (returning user hydrating at pool)', () => {
    act(() => {
      useStore.getState().setHydrated(true);
      useStore.getState().setStep('pool');
    });

    renderWithProviders(<Flow />);

    // Welcome's headline should NOT be in the DOM — the user skipped it.
    expect(screen.queryByRole('heading', { name: /game tier list ultimate/i })).toBeNull();
    // Pool's eyebrow should be present.
    expect(screen.getByText(/Step 3/i)).toBeInTheDocument();
  });
});
