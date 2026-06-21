import { NextResponse, type NextRequest } from 'next/server';

import { recordPoolDelta } from '@/lib/pool-stats-service';

function cleanIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((n) => Number(n)).filter((n) => Number.isFinite(n));
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
