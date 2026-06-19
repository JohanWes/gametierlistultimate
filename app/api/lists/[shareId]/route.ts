import { NextResponse } from 'next/server';

import { getList } from '@/lib/lists-repo';

/** GET /api/lists/:shareId — fetch a published snapshot for the public read-only view. */
export async function GET(_req: Request, ctx: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await ctx.params;
  const list = await getList(shareId);
  if (!list) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ list });
}
