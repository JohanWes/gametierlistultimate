import { NextResponse, type NextRequest } from 'next/server';

import { createList, type SnapshotGame } from '@/lib/lists-repo';

/** POST /api/lists — publish a final tier-list snapshot, return { shareId, url }. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { tiers?: unknown; games?: SnapshotGame[] }
    | null;

  if (!body || typeof body.tiers !== 'object' || body.tiers === null) {
    return NextResponse.json({ error: 'Missing or invalid `tiers`.' }, { status: 400 });
  }

  const games = Array.isArray(body.games) ? body.games : [];
  const { shareId } = await createList({ tiers: body.tiers as never, games });

  const url = `${req.nextUrl.origin}/s/${shareId}`;
  return NextResponse.json({ shareId, url }, { status: 201 });
}
