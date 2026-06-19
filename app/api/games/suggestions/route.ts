import { NextResponse, type NextRequest } from 'next/server';

import { getSuggestions } from '@/lib/games/repo';
import type { Preferences, SuggestionContext } from '@/lib/games/types';

function parseList(value: string | null): string[] {
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function parseIds(value: string | null): number[] {
  return parseList(value)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

/** GET /api/games/suggestions?genres=&platforms=&exclude=&seedIds=&rejectIds=&limit= */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const prefs: Preferences = {
    genres: parseList(searchParams.get('genres')),
    platforms: parseList(searchParams.get('platforms')),
  };
  const exclude = parseIds(searchParams.get('exclude'));
  const context: SuggestionContext = {
    seedIds: parseIds(searchParams.get('seedIds')),
    rejectIds: parseIds(searchParams.get('rejectIds')),
  };
  const limitRaw = Number(searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 30;

  const games = await getSuggestions(prefs, exclude, limit, context);
  return NextResponse.json({ games });
}
