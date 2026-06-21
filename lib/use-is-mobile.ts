'use client';

import { useEffect, useState } from 'react';

/** Phones and small tablets in portrait — below Tailwind's `md` breakpoint. */
const MOBILE_QUERY = '(max-width: 767px)';

/**
 * Reports whether the viewport is in the mobile range. Starts `false` so the server render and
 * first client paint agree (the pool step shows a loading skeleton at mount, so there is no flash
 * of the wrong layout before the effect resolves). In jsdom the `matchMedia` stub reports
 * `matches: false`, which keeps component tests on the desktop path.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return isMobile;
}
