/**
 * Tiny Web Audio sound system. SFX are synthesized at play time (no audio files). The
 * AudioContext is created lazily on the first user gesture to respect browser autoplay policy,
 * and every play is a no-op while muted or before that first interaction.
 */

export type SoundName = 'click' | 'blip' | 'hover' | 'success' | 'reveal';

type Ctor = new () => AudioContext;

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
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

/** Lazily build (and cache) a short white-noise buffer used for the click transient. */
function getNoiseBuffer(context: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.floor(context.sampleRate * 0.2);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/**
 * The "no"/Pass click: a crisp highpassed noise tick layered with a short, filtered triangle
 * pluck that drops in pitch — tight and poppy. (The other sounds use the plain `tone` above.)
 */
function clickSound(context: AudioContext): void {
  const now = context.currentTime;

  // Crisp transient — a brief, highpassed noise tick.
  const src = context.createBufferSource();
  src.buffer = getNoiseBuffer(context);
  const hp = context.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(2200, now);
  const nAmp = context.createGain();
  nAmp.gain.setValueAtTime(0.11, now);
  nAmp.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
  src.connect(hp).connect(nAmp).connect(context.destination);
  src.start(now);
  src.stop(now + 0.045);

  // Tight pluck — triangle dropping 880 → 500 Hz through a gentle lowpass.
  const osc = context.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(500, now + 0.05);
  const lp = context.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3200, now);
  lp.Q.setValueAtTime(0.7, now);
  const amp = context.createGain();
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(0.145, now + 0.003);
  amp.gain.setTargetAtTime(0.0001, now + 0.012, 0.017);
  osc.connect(lp).connect(amp).connect(context.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}

function synth(context: AudioContext, name: SoundName): void {
  switch (name) {
    case 'click':
      clickSound(context);
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
  noiseBuffer = null;
  initialized = false;
  muted = false;
}
