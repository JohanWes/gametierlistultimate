import { NextResponse } from 'next/server';

/** Liveness probe — also handy for Vercel uptime checks. */
export function GET() {
  return NextResponse.json({ ok: true });
}
