import { NextResponse, type NextRequest } from 'next/server';

import { getByIds } from '@/lib/games/repo';

/** GET /api/games/by-ids?ids=1,2,3 — hydrate a game pool. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('ids') ?? '';
  const ids = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));

  if (ids.length === 0) {
    return NextResponse.json({ games: [] });
  }

  const games = await getByIds(ids);
  return NextResponse.json({ games });
}
