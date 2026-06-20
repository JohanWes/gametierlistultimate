import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetAudioForTest, initAudio, isAudioReady, playSound, setMuted } from './index';

// A minimal Web Audio mock: connect() returns the next node so the chain works. AudioParams
// expose every setter the synth engine touches (the click voice adds a noise source + filters)
// so playSound runs without throwing.
function makeParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

function makeNode() {
  return {
    type: '',
    connect: (n: unknown) => n,
    start: vi.fn(),
    stop: vi.fn(),
    buffer: null as unknown,
    frequency: makeParam(),
    detune: makeParam(),
    Q: makeParam(),
    gain: makeParam(),
  };
}

const createOscillator = vi.fn(makeNode);
const createGain = vi.fn(makeNode);
const createBiquadFilter = vi.fn(makeNode);
const createBufferSource = vi.fn(makeNode);
const createBuffer = vi.fn((_channels: number, length: number) => ({
  getChannelData: () => new Float32Array(length),
}));

class MockAudioContext {
  currentTime = 0;
  state = 'running';
  sampleRate = 44100;
  destination = {};
  resume = vi.fn();
  createOscillator = createOscillator;
  createGain = createGain;
  createBiquadFilter = createBiquadFilter;
  createBufferSource = createBufferSource;
  createBuffer = createBuffer;
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
