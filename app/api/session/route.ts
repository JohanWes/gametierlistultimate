import { NextResponse, type NextRequest } from 'next/server';

import { getSessionId, newSessionId, setSessionCookie } from '@/lib/session';
import { ensureSession, getSession, saveSession, type SessionState } from '@/lib/sessions-repo';

/** POST /api/session — ensure a session exists, set the cookie, return { sessionId }. */
export async function POST(req: NextRequest) {
  const sessionId = getSessionId(req) ?? newSessionId();
  await ensureSession(sessionId);

  const res = NextResponse.json({ sessionId });
  setSessionCookie(res, sessionId);
  return res;
}

/** GET /api/session — load saved in-progress state for the current session. */
export async function GET(req: NextRequest) {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return NextResponse.json({ session: null });
  }
  const session = await getSession(sessionId);
  return NextResponse.json({ session });
}

/** PUT /api/session — autosave partial prefs/pool/scores (debounced from the client). */
export async function PUT(req: NextRequest) {
  let sessionId = getSessionId(req);
  const issuedNew = !sessionId;
  if (!sessionId) sessionId = newSessionId();

  const body = (await req.json().catch(() => ({}))) as SessionState;
  const state: SessionState = {
    prefs: body.prefs,
    pool: body.pool,
    scores: body.scores,
  };
  await saveSession(sessionId, state);

  const res = NextResponse.json({ ok: true, sessionId });
  // If the client autosaved before ever calling POST, make sure it gets a cookie.
  if (issuedNew) setSessionCookie(res, sessionId);
  return res;
}
