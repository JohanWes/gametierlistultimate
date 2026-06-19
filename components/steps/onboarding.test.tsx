import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStore, startAutosave, useStore } from '@/lib/store';
import { fireEvent, renderWithProviders, screen } from '@/test/helpers/render';

import { OnboardingStep } from './OnboardingStep';

describe('OnboardingStep', () => {
  beforeEach(() => resetStore());

  it('renders all 16 genres and 6 preference toggles', () => {
    renderWithProviders(<OnboardingStep />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(16);
    expect(screen.getAllByRole('switch')).toHaveLength(6);
  });

  it('toggles a genre into the store on click', () => {
    renderWithProviders(<OnboardingStep />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'RPG' }));
    expect(useStore.getState().prefs.genres).toContain('RPG');
  });

  it('toggles a genre into the store on touch', () => {
    renderWithProviders(<OnboardingStep />);
    fireEvent.touchEnd(screen.getByRole('checkbox', { name: 'Horror' }));
    expect(useStore.getState().prefs.genres).toContain('Horror');
  });

  it('sets the chaos flag when its switch is toggled', () => {
    renderWithProviders(<OnboardingStep />);
    fireEvent.click(screen.getByRole('switch', { name: /chaos mode/i }));
    expect(useStore.getState().prefs.flags.chaos).toBe(true);
  });

  describe('Continue', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('advances to the pool step and autosaves the selected prefs', () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
      const stop = startAutosave({ waitMs: 500, fetchImpl });
      useStore.getState().setStep('onboarding'); // the screen is reached from welcome in real flow
      useStore.getState().setHydrated(true);

      renderWithProviders(<OnboardingStep />);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Strategy' }));
      fireEvent.click(screen.getByRole('button', { name: /continue/i }));

      expect(useStore.getState().ui.step).toBe('pool');

      vi.advanceTimersByTime(500);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('/api/session');
      expect(init).toMatchObject({ method: 'PUT' });
      expect(JSON.parse(init.body).prefs.genres).toContain('Strategy');

      stop();
    });
  });
});
