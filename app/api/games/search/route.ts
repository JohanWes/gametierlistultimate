import { NextResponse, type NextRequest } from 'next/server';

import { searchLocal, upsertGames } from '@/lib/games/repo';
import type { GameResult } from '@/lib/games/types';
import { searchIgdb } from '@/lib/igdb';

/** Below this many local hits, we consider local results "weak" and fall back to IGDB. */
const LOCAL_SUFFICIENT_THRESHOLD = 3;

/**
 * GET /api/games/search?q=&limit=
 * Local-first: query Mongo, and only call IGDB when local results are weak/empty. New IGDB
 * games are upserted into Mongo so subsequent searches stay local. Results are tagged by source.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) {
    return NextResponse.json({ results: [], source: 'local' });
  }

  const limitRaw = Number(req.nextUrl.searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;

  const local = await searchLocal(q, limit);
  if (local.length >= LOCAL_SUFFICIENT_THRESHOLD) {
    const results: GameResult[] = local.map((g) => ({ ...g, source: 'local' }));
    return NextResponse.json({ results, source: 'local' });
  }

  // Local is weak/empty → fall back to IGDB and persist anything new.
  const igdb = await searchIgdb(q, limit);
  if (igdb.length > 0) {
    await upsertGames(igdb);
  }

  // Merge, de-duping on igdbId and preferring local entries.
  const seen = new Set(local.map((g) => g.igdbId));
  const merged: GameResult[] = [
    ...local.map((g) => ({ ...g, source: 'local' as const })),
    ...igdb
      .filter((g) => !seen.has(g.igdbId))
      .map((g) => ({ ...g, source: 'igdb' as const })),
  ];

  return NextResponse.json({ results: merged, source: igdb.length > 0 ? 'igdb' : 'local' });
}
