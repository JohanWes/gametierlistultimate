import { beforeEach, describe, expect, it } from 'vitest';

import { resetStarterBatchPrefetch } from '@/lib/games/prefetch';
import { resetStore, useStore } from '@/lib/store';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { WelcomeStep } from './WelcomeStep';

describe('WelcomeStep', () => {
  beforeEach(() => {
    resetStore();
    resetStarterBatchPrefetch();
  });

  it('renders the headline and the full how-it-works sequence', () => {
    renderWithProviders(<WelcomeStep />);
    expect(
      screen.getByRole('heading', { name: /game tier list ultimate/i }),
    ).toBeInTheDocument();
    for (const beat of ['Choose games', 'Play rounds', 'Get your list']) {
      expect(screen.getByText(beat)).toBeInTheDocument();
    }
  });

  it('advances the flow to the pool after the coin-insert beat', async () => {
    renderWithProviders(<WelcomeStep />);
    expect(useStore.getState().ui.step).toBe('welcome');
    fireEvent.click(screen.getByRole('button', { name: /press start/i }));
    // The coin-drop beat holds the step briefly before advancing.
    expect(useStore.getState().ui.step).toBe('welcome');
    await waitFor(() => expect(useStore.getState().ui.step).toBe('pool'), {
      timeout: 2000,
    });
  });

  it('ignores extra presses while the coin is dropping (advances exactly one step)', async () => {
    renderWithProviders(<WelcomeStep />);
    const button = screen.getByRole('button', { name: /press start/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(useStore.getState().ui.step).toBe('pool'), {
      timeout: 2000,
    });
    // A double-fire would have advanced past the pool — give it a beat to prove it doesn't.
    await new Promise((r) => setTimeout(r, 100));
    expect(useStore.getState().ui.step).toBe('pool');
  });
});
