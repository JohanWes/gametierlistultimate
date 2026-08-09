import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStore, useStore } from '@/lib/store';
import { act, renderWithProviders } from '@/test/helpers/render';

import { SoundHydrator } from './SoundHydrator';

const soundMock = vi.hoisted(() => {
  let muted = false;
  return {
    initAudio: vi.fn(),
    setMuted: vi.fn((value: boolean) => {
      muted = value;
    }),
    isMuted: () => muted,
  };
});

vi.mock('@/lib/sound', () => soundMock);

import { initAudio, isMuted, setMuted } from '@/lib/sound';

describe('SoundHydrator', () => {
  beforeEach(() => {
    resetStore();
    window.localStorage.clear();
    setMuted(false); // reset the mock's tracked mute flag
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores the persisted mute preference (off → muted)', () => {
    window.localStorage.setItem('gtl_sound', 'off');

    renderWithProviders(<SoundHydrator />);

    expect(useStore.getState().ui.soundOn).toBe(false);
    expect(isMuted()).toBe(true);
  });

  it('leaves sound on when no mute preference is persisted', () => {
    renderWithProviders(<SoundHydrator />);

    expect(useStore.getState().ui.soundOn).toBe(true);
    expect(isMuted()).toBe(false);
  });

  it('keeps the sound module mute flag in sync with the store', () => {
    renderWithProviders(<SoundHydrator />);
    expect(isMuted()).toBe(false); // initial sync: soundOn true

    act(() => {
      useStore.getState().toggleSound();
    });
    expect(isMuted()).toBe(true);

    act(() => {
      useStore.getState().toggleSound();
    });
    expect(isMuted()).toBe(false);
  });

  it('initializes audio once on the first gesture and then forgets the listeners', () => {
    renderWithProviders(<SoundHydrator />);
    expect(initAudio).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('pointerdown'));
    expect(initAudio).toHaveBeenCalledTimes(1);

    // Listeners are removed after the first gesture — further gestures do nothing.
    window.dispatchEvent(new Event('keydown'));
    window.dispatchEvent(new Event('touchstart'));
    expect(initAudio).toHaveBeenCalledTimes(1);
  });

  it('cleans up the subscription and gesture listeners on unmount', () => {
    const { unmount } = renderWithProviders(<SoundHydrator />);
    const syncCalls = setMuted.mock.calls.length;
    expect(syncCalls).toBe(1);

    unmount();

    // No gesture listener remains after unmount.
    window.dispatchEvent(new Event('pointerdown'));
    expect(initAudio).not.toHaveBeenCalled();

    // The store subscription is gone — store changes no longer reach the sound module.
    act(() => {
      useStore.getState().toggleSound();
    });
    expect(setMuted.mock.calls.length).toBe(syncCalls);
  });
});
