'use client';

import { useSyncExternalStore } from 'react';

/** Phones and small tablets in portrait — below Tailwind's `md` breakpoint. */
const MOBILE_QUERY = '(max-width: 767px)';

let mql: MediaQueryList | null = null;
const media = () => (mql ??= window.matchMedia(MOBILE_QUERY));

function subscribe(onChange: () => void) {
  media().addEventListener('change', onChange);
  return () => media().removeEventListener('change', onChange);
}

/**
 * Whether the viewport is in the mobile range. Read synchronously on the client so phones never
 * paint the desktop layout first; the server snapshot is `false` so hydration stays consistent.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => media().matches,
    () => false,
  );
}
