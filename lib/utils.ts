import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind class names, resolving conflicts (later wins). Used by every primitive. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Clamp a number into the inclusive [min, max] range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export type ColorStop = { at: number; rgb: readonly [number, number, number] };

/** Interpolate `value` across ascending color stops into an `rgb(r g b / alpha)` string. */
export function interpolateColor(stops: readonly ColorStop[], value: number, alpha = 1): string {
  const s = clamp(value, stops[0].at, stops[stops.length - 1].at);
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (s >= stops[i].at && s <= stops[i + 1].at) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const t = (s - lo.at) / (hi.at - lo.at || 1);
  const [r, g, b] = lo.rgb.map((c, i) => Math.round(c + (hi.rgb[i] - c) * t));
  return `rgb(${r} ${g} ${b}${alpha !== 1 ? ` / ${alpha}` : ''})`;
}

/**
 * Trailing-edge debounce. Returns a wrapped function plus a `cancel` to drop a pending call.
 * Used for autosave so rapid store changes collapse into a single PUT.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): ((...args: Args) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}
