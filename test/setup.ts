import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { mswServer } from './helpers/msw';

// Start the MSW network-mock server for the whole test run. mongodb-memory-server uses
// raw TCP sockets (not fetch), so it is unaffected by these HTTP interceptors.
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
