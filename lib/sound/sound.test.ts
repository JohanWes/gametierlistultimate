import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetAudioForTest, initAudio, isAudioReady, playSound, setMuted } from './index';

// A minimal Web Audio mock: connect() returns the next node so the chain works.
function makeNode() {
  return {
    type: '',
    connect: (n: unknown) => n,
    start: vi.fn(),
    stop: vi.fn(),
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
  };
}

const createOscillator = vi.fn(makeNode);
const createGain = vi.fn(makeNode);

class MockAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  resume = vi.fn();
  createOscillator = createOscillator;
  createGain = createGain;
}

describe('sound system', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetAudioForTest();
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
  });

  it('attempts no audio before the first interaction (no init)', () => {
    setMuted(false);
    expect(isAudioReady()).toBe(false);
    playSound('click');
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('respects mute after init', () => {
    initAudio();
    expect(isAudioReady()).toBe(true);
    setMuted(true);
    playSound('click');
    expect(createOscillator).not.toHaveBeenCalled();
  });

  it('plays once initialized and unmuted', () => {
    initAudio();
    setMuted(false);
    playSound('click');
    expect(createOscillator).toHaveBeenCalled();
  });

  it('initAudio is idempotent', () => {
    initAudio();
    initAudio();
    setMuted(false);
    playSound('blip');
    expect(createOscillator).toHaveBeenCalled();
  });
});
