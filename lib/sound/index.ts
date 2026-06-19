/**
 * Tiny Web Audio sound system. SFX are synthesized at play time (no audio files). The
 * AudioContext is created lazily on the first user gesture to respect browser autoplay policy,
 * and every play is a no-op while muted or before that first interaction.
 */

export type SoundName = 'click' | 'blip' | 'hover' | 'success' | 'reveal';

type Ctor = new () => AudioContext;

let ctx: AudioContext | null = null;
let initialized = false;
let muted = false;

function getCtor(): Ctor | null {
  const g = globalThis as unknown as {
    AudioContext?: Ctor;
    webkitAudioContext?: Ctor;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** Whether the audio context has been created (i.e. a user has interacted). */
export function isAudioReady(): boolean {
  return initialized;
}

/** Mirror the store's mute state into the sound module. */
export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

/**
 * Create the AudioContext. Safe to call repeatedly (idempotent) and safe in environments
 * without Web Audio (no-op). Call this from the first user gesture only.
 */
export function initAudio(): void {
  if (initialized) return;
  const Ctor = getCtor();
  if (!Ctor) return;
  ctx = new Ctor();
  initialized = true;
}

/** A single voice: oscillator → gain envelope → destination. */
function tone(
  context: AudioContext,
  opts: { type: OscillatorType; from: number; to?: number; duration: number; gain: number; delay?: number },
): void {
  const now = context.currentTime + (opts.delay ?? 0);
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.from, now);
  if (opts.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), now + opts.duration);
  }
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(opts.gain, now + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);
  osc.connect(amp).connect(context.destination);
  osc.start(now);
  osc.stop(now + opts.duration + 0.02);
}

function synth(context: AudioContext, name: SoundName): void {
  switch (name) {
    case 'click':
      tone(context, { type: 'square', from: 320, to: 220, duration: 0.07, gain: 0.18 });
      break;
    case 'hover':
      tone(context, { type: 'sine', from: 520, duration: 0.05, gain: 0.06 });
      break;
    case 'blip':
      tone(context, { type: 'triangle', from: 660, to: 880, duration: 0.09, gain: 0.16 });
      break;
    case 'success':
      tone(context, { type: 'triangle', from: 523, duration: 0.1, gain: 0.16 });
      tone(context, { type: 'triangle', from: 784, duration: 0.16, gain: 0.16, delay: 0.09 });
      break;
    case 'reveal':
      tone(context, { type: 'sawtooth', from: 300, to: 1200, duration: 0.32, gain: 0.14 });
      tone(context, { type: 'sine', from: 600, to: 1600, duration: 0.32, gain: 0.08, delay: 0.02 });
      break;
  }
}

/** Play an SFX. No-op while muted or before the first user interaction initializes audio. */
export function playSound(name: SoundName): void {
  if (muted) return;
  if (!initialized || !ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  synth(ctx, name);
}

/** Test-only: tear down module state between cases. */
export function __resetAudioForTest(): void {
  ctx = null;
  initialized = false;
  muted = false;
}
