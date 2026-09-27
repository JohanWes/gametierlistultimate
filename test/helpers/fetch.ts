import { vi } from 'vitest';

/**
 * Replace the global `fetch` for the current test (auto-restored: `unstubGlobals` in the vitest
 * config). `respond` maps each request URL to a JSON body (served as a 200), or returns a
 * `Response` as-is (e.g. an error status); throwing rejects the fetch like a network error.
 */
export function mockFetch(respond: (url: string) => unknown = () => ({})) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const body = await respond(String(input));
    return body instanceof Response ? body : Response.json(body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
