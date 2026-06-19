import type { NextRequest, NextResponse } from 'next/server';

/** Name of the anonymous-session cookie. */
export const SESSION_COOKIE = 'gtl_session';

/** One year — sessions are long-lived since there is no login to renew them. */
const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

/** Read the session id from the incoming request's cookies, or null if absent. */
export function getSessionId(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

/** Generate a fresh anonymous session id (no PII). */
export function newSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Attach the session cookie to a response. `httpOnly` (not readable by JS), `SameSite=Lax`,
 * and `Secure` in production.
 */
export function setSessionCookie(res: NextResponse, sessionId: string): void {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: sessionId,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}
