import { NextResponse } from 'next/server';

import { getByIds, getCachedVideo, setCachedVideo } from '@/lib/games/repo';
import { searchGameplayVideo } from '@/lib/youtube';

/** Re-resolve a cached miss after this long, in case footage has since been uploaded. */
const MISS_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * GET /api/games/:igdbId/video — resolve the game to a YouTube gameplay video id, cached per game.
 *
 * The search term is the game's own title read from Mongo — never a client-supplied string — so a
 * crafted request can't poison a real game's cached video. A normal "no footage found" and an
 * upstream failure both return `200 { videoId: null }` (the client shows an "Open on YouTube"
 * fallback); non-200 is reserved for bad input (400) and unknown games (404).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ igdbId: string }> }) {
  const { igdbId: raw } = await ctx.params;
  const igdbId = Number(raw);
  if (!Number.isInteger(igdbId) || igdbId <= 0) {
    return NextResponse.json({ error: 'Invalid game id' }, { status: 400 });
  }

  // Fast path: a fresh cached resolution short-circuits before any Mongo title lookup or scrape.
  const cached = await getCachedVideo(igdbId);
  if (cached) {
    if (cached.status === 'hit') {
      return NextResponse.json({ videoId: cached.videoId });
    }
    if (Date.now() - cached.resolvedAt.getTime() < MISS_RETRY_MS) {
      return NextResponse.json({ videoId: null });
    }
    // Stale miss — fall through and try resolving again.
  }

  const game = (await getByIds([igdbId]))[0];
  if (!game) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const result = await searchGameplayVideo(game.title);
  if (result.status === 'error') {
    // Transient upstream failure — don't cache it, so the next click retries instead of being
    // stuck on the fallback for the whole miss TTL. The client still shows the link-out for now.
    return NextResponse.json({ videoId: null });
  }

  const videoId = result.status === 'hit' ? result.videoId : null;
  await setCachedVideo(igdbId, videoId);
  return NextResponse.json({ videoId });
}
