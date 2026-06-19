import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { IGDB_TOKEN_URL, IGDB_GAMES_URL } from '@/lib/igdb';

/**
 * Default IGDB / Twitch OAuth handlers. Individual tests override these with
 * `mswServer.use(...)` to assert specific behaviour (token caching, search shape, etc.).
 */
export const defaultHandlers = [
  http.post(IGDB_TOKEN_URL, () =>
    HttpResponse.json({ access_token: 'test-token', expires_in: 3600, token_type: 'bearer' }),
  ),
  http.post(IGDB_GAMES_URL, () => HttpResponse.json([])),
];

export const mswServer = setupServer(...defaultHandlers);
