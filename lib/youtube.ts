/**
 * Server-only resolver that turns a game title into a YouTube gameplay video id by reading the
 * public search results page. No API key, no quota — we cache the result in Mongo per game (see
 * `getCachedVideo`/`setCachedVideo` in `lib/games/repo.ts`) so each game is resolved at most once.
 *
 * The returned id is a *best-effort candidate*, not a guaranteed-embeddable video — the modal keeps
 * an "Open on YouTube" link for the rare embedding-disabled/age-gated case. Never call from the
 * client (it scrapes a third-party page with a desktop UA).
 */

/** Bump when the resolver logic changes so cached rows can be re-resolved if ever needed. */
export const YOUTUBE_RESOLVER_VERSION = 1;

const YOUTUBE_RESULTS_URL = 'https://www.youtube.com/results';
const REQUEST_TIMEOUT_MS = 5000;
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Titles that strongly signal a long-form playthrough (favoured). */
const PREFER_PATTERN = /full game|walkthrough|playthrough|no commentary|longplay|full playthrough/i;
/** Titles that signal the wrong kind of clip (penalised). */
const AVOID_PATTERN = /\btrailer\b|\bteaser\b|\breveal\b|\breview\b|announcement/i;

/**
 * The single search query used to find footage. Exported so the UI's "Open on YouTube" fallback
 * link searches for the exact same thing the resolver did (no drift between them).
 */
export function gameplayQuery(title: string): string {
  return `${title} full gameplay walkthrough`;
}

interface VideoCandidate {
  videoId: string;
  title: string;
}

/**
 * Slice the first balanced `{...}` object out of `html` starting at `marker`. A brace counter that
 * skips over string contents (and escapes) so nested braces inside the JSON don't end it early.
 * Returns the parsed object or null.
 */
function extractJsonAfter(html: string, marker: string): unknown {
  const at = html.indexOf(marker);
  if (at === -1) return null;
  const start = html.indexOf('{', at);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Pull the search-result video renderers out of a parsed `ytInitialData` blob, in page order. */
function collectCandidates(data: unknown): VideoCandidate[] {
  const out: VideoCandidate[] = [];
  // Walk the documented path, but defensively: any missing node just yields no candidates.
  const sections =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data as any)?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
      ?.contents;
  if (!Array.isArray(sections)) return out;

  for (const section of sections) {
    const items = section?.itemSectionRenderer?.contents;
    if (!Array.isArray(items)) continue; // skips reelShelf/shelf rows (Shorts) — not videoRenderers
    for (const item of items) {
      const vr = item?.videoRenderer;
      if (!vr || typeof vr.videoId !== 'string') continue; // skips adSlotRenderer, promotedVideo, etc.
      const title: string =
        vr.title?.runs?.[0]?.text ?? vr.title?.simpleText ?? vr.title?.accessibility?.label ?? '';
      out.push({ videoId: vr.videoId, title: String(title) });
    }
  }
  return out;
}

/** Score a candidate: prefer playthrough-ish titles, avoid trailers. Order is the tiebreaker. */
function scoreCandidate(c: VideoCandidate): number {
  let score = 0;
  if (PREFER_PATTERN.test(c.title)) score += 2;
  if (AVOID_PATTERN.test(c.title)) score -= 3;
  return score;
}

/**
 * Outcome of a resolve. `hit`/`miss` are *definitive* (we successfully read YouTube's results) and
 * are safe to cache; `error` means the request itself failed (timeout, non-OK, network) and must
 * NOT be cached — otherwise one transient blip would disable a game's footage for everyone until
 * the retry TTL elapses.
 */
export type VideoResolution =
  | { status: 'hit'; videoId: string }
  | { status: 'miss' }
  | { status: 'error' };

/**
 * Resolve `title` to a YouTube gameplay video. Never throws. `fetchImpl` is injectable so tests can
 * drive it deterministically. See {@link VideoResolution} for the hit/miss/error distinction.
 */
export async function searchGameplayVideo(
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VideoResolution> {
  const trimmed = title.trim();
  if (!trimmed) return { status: 'miss' };

  const url = new URL(YOUTUBE_RESULTS_URL);
  url.searchParams.set('search_query', gameplayQuery(trimmed));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetchImpl(url.toString(), {
      headers: { 'User-Agent': DESKTOP_UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: controller.signal,
    });
    if (!res.ok) return { status: 'error' };
    html = await res.text();
  } catch {
    // Network error, timeout/abort — transient; report 'error' so the caller does not cache it.
    return { status: 'error' };
  } finally {
    clearTimeout(timer);
  }

  // Primary: parse the structured search data so we skip ads, Shorts shelves, and promos.
  const candidates = collectCandidates(extractJsonAfter(html, 'ytInitialData'));
  if (candidates.length > 0) {
    // Light scoring over the first handful; stable order keeps the first result as the tiebreaker.
    const head = candidates.slice(0, 6);
    let best = head[0];
    let bestScore = scoreCandidate(best);
    for (const c of head.slice(1)) {
      const s = scoreCandidate(c);
      if (s > bestScore) {
        best = c;
        bestScore = s;
      }
    }
    return { status: 'hit', videoId: best.videoId };
  }

  // Fallback: structure changed — grab the first videoId token. Less precise, but better than null.
  const match = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
  // We read the page successfully, so "no videoId anywhere" is a definitive miss, not an error.
  return match ? { status: 'hit', videoId: match[1] } : { status: 'miss' };
}
