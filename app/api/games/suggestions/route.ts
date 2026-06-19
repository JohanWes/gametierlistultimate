import { NextResponse, type NextRequest } from 'next/server';

import { getSuggestions } from '@/lib/games/repo';
import type { Preferences } from '@/lib/games/types';

function parseList(value: string | null): string[] {
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function parseIds(value: string | null): number[] {
  return parseList(value)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

/** GET /api/games/suggestions?genres=&platforms=&exclude=&limit= */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const prefs: Preferences = {
    genres: parseList(searchParams.get('genres')),
    platforms: parseList(searchParams.get('platforms')),
  };
  const exclude = parseIds(searchParams.get('exclude'));
  const limitRaw = Number(searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 30;

  const games = await getSuggestions(prefs, exclude, limit);
  return NextResponse.json({ games });
}
