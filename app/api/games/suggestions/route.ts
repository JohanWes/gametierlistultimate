import { NextResponse, type NextRequest } from 'next/server';

import { getSuggestions } from '@/lib/games/repo';
import type { SuggestionContext } from '@/lib/games/types';

const COLD_PRESET_CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400';

function parseList(value: string | null): string[] {
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function parseIds(value: string | null): number[] {
  return parseList(value)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

/** GET /api/games/suggestions?exclude=&seedIds=&rejectIds=&preset=&limit= */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const exclude = parseIds(searchParams.get('exclude'));
  const seedIds = parseIds(searchParams.get('seedIds'));
  const rejectIds = parseIds(searchParams.get('rejectIds'));
  const preset = searchParams.get('preset') === 'true';
  const context: SuggestionContext = { seedIds, rejectIds, preset };
  const limitRaw = Number(searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 30;

  const games = await getSuggestions(exclude, limit, context);
  // The cold starter shelf is identical for every new visitor, so let the CDN serve it.
  const coldPreset = preset && !exclude.length && !seedIds.length && !rejectIds.length;
  return NextResponse.json(
    { games },
    coldPreset ? { headers: { 'Cache-Control': COLD_PRESET_CACHE_CONTROL } } : undefined,
  );
}
