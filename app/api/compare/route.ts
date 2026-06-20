import { NextResponse, type NextRequest } from 'next/server';

import { compareToCommunity } from '@/lib/compare';
import { countLists, getGameStats, normalizeTiers } from '@/lib/lists-repo';
import { TIER_ORDER } from '@/lib/ranking';

/**
 * POST /api/compare — compare an in-progress / pre-publish tier list to the community aggregate.
 * Body: `{ tiers }`. Returns `{ similarityPercent, outliers, sampleSize }`. The list isn't in the
 * aggregate yet, so no self-subtraction is needed.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { tiers?: unknown } | null;
  if (!body || typeof body.tiers !== 'object' || body.tiers === null) {
    return NextResponse.json({ error: 'Missing or invalid `tiers`.' }, { status: 400 });
  }

  const tiers = normalizeTiers(body.tiers);
  const gameIds = TIER_ORDER.flatMap((t) => tiers[t]);
  const [stats, sampleSize] = await Promise.all([getGameStats(gameIds), countLists()]);

  return NextResponse.json(compareToCommunity(tiers, stats, { sampleSize }));
}
