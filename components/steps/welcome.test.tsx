import { beforeEach, describe, expect, it } from 'vitest';

import { resetStore, useStore } from '@/lib/store';
import { fireEvent, renderWithProviders, screen } from '@/test/helpers/render';

import { WelcomeStep } from './WelcomeStep';

describe('WelcomeStep', () => {
  beforeEach(() => resetStore());

  it('renders the headline and the full how-it-works sequence', () => {
    renderWithProviders(<WelcomeStep />);
    expect(
      screen.getByRole('heading', { name: /build your ultimate game tier list/i }),
    ).toBeInTheDocument();
    for (const beat of ['Pick genres', 'Choose games', 'Play rounds', 'Get your list']) {
      expect(screen.getByText(beat)).toBeInTheDocument();
    }
  });

  it('advances the flow to onboarding when Start is clicked', () => {
    renderWithProviders(<WelcomeStep />);
    expect(useStore.getState().ui.step).toBe('welcome');
    fireEvent.click(screen.getByRole('button', { name: /press start/i }));
    expect(useStore.getState().ui.step).toBe('onboarding');
  });
});
