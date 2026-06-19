import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // Playwright specs live in e2e/ and are run by `npm run test:e2e`, not Vitest.
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
    // mongodb-memory-server can take a moment to download/spin up on first run.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
