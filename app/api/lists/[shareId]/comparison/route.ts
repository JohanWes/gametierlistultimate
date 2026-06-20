import { NextResponse } from 'next/server';

import { compareToCommunity } from '@/lib/compare';
import { countLists, getGameStats, getList } from '@/lib/lists-repo';
import { TIER_ORDER } from '@/lib/ranking';

/**
 * GET /api/lists/:shareId/comparison — how a published list compares to the community. Its own
 * placements are baked into the aggregate, so `subtractSelf` removes them before comparing (a
 * list is never compared against itself).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await ctx.params;
  const list = await getList(shareId);
  if (!list) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const gameIds = TIER_ORDER.flatMap((t) => list.tiers[t]);
  const [stats, sampleSize] = await Promise.all([getGameStats(gameIds), countLists()]);

  return NextResponse.json(
    compareToCommunity(list.tiers, stats, { sampleSize, subtractSelf: true }),
  );
}
