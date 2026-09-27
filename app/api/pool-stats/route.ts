import { NextResponse, type NextRequest } from 'next/server';

import { isIgdbId } from '@/lib/lists-repo';
import { recordPoolDelta } from '@/lib/pool-stats-service';

/** Bound anonymous input so a hostile POST can't drive unbounded bulk writes. */
const MAX_POOL_IDS = 150;

function cleanIds(value: unknown): number[] {
  return Array.isArray(value) ? value.slice(0, MAX_POOL_IDS).filter(isIgdbId) : [];
}

/**
 * POST /api/pool-stats — write-only. Records a previous→next pool delta into the anonymous
 * community aggregates. Fire-and-forget from the client; returns no state and sets no cookie.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { previous?: unknown; next?: unknown };
  await recordPoolDelta(cleanIds(body.previous), cleanIds(body.next));
  return NextResponse.json({ ok: true });
}
