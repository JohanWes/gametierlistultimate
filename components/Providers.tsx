'use client';

import { StoreHydrator } from './StoreHydrator';

/** App-wide client providers. Mounts session hydration, autosave, and sound wiring. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StoreHydrator />
      {children}
    </>
  );
}
