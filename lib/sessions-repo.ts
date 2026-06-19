import { COLLECTIONS, getDb } from './mongo';
import { updatePoolPatternAggregates } from './pool-patterns-repo';

import { getStarterSet } from './games/repo';
import { getStarterSetIds, setResolvedStarterIds } from './games/starter-set';

/** Mutable, autosaved in-progress state for an anonymous session. */
export interface SessionState {
  prefs?: Record<string, unknown>;
  pool?: number[];
  scores?: Record<string, unknown>;
}

export interface SessionDoc extends SessionState {
  sessionId: string;
  createdAt: Date;
  updatedAt: Date;
}

async function sessionsCollection() {
  const db = await getDb();
  return db.collection<SessionDoc>(COLLECTIONS.sessions);
}

/* ------------------------------------------------------------------ starter guardrail */

/**
 * Once-per-process flag: have we attempted to resolve the starter-set ids for the predictor
 * guardrail? On serverless cold starts the module-level cache in `starter-set.ts` is empty
 * (the suggestions API that normally populates it ran in a different invocation), so the
 * first `saveSession` resolves the ids itself. The flag prevents re-scanning the games
 * collection on every subsequent save in the same process.
 */
let starterResolutionAttempted = false;

/** Test-only: reset the guardrail so each test starts with a clean cache and flag. */
export function resetStarterGuardrail(): void {
  starterResolutionAttempted = false;
  setResolvedStarterIds([]);
}

/**
 * Ensure the starter-set id cache is populated. If the suggestions API already populated it
 * (same process, warm invocation), this is a no-op. Otherwise, resolve the starter games from
 * the `games` collection once. Best-effort — if resolution throws (e.g. transient DB error),
 * the flag is NOT set so the next save retries; if resolution succeeds but returns empty
 * (no matching games in the DB), the flag IS set because retrying won't help.
 */
async function ensureStarterIdsResolved(): Promise<void> {
  if (starterResolutionAttempted) return;
  if (getStarterSetIds().size > 0) return;
  try {
    await getStarterSet();
    // Resolution succeeded (even if 0 games matched). Don't retry — an empty DB won't
    // populate starters on a second scan, so the flag prevents redundant full-collection
    // scans on every subsequent save.
    starterResolutionAttempted = true;
  } catch {
    // Transient failure — leave the flag false so the next save retries resolution.
  }
}

/** Filter starter-set ids out of a pool so they don't inflate co-occurrence hubs. */
function filterStarterIds(pool: number[], starterIds: Set<number>): number[] {
  if (starterIds.size === 0) return pool;
  return pool.filter((id) => !starterIds.has(id));
}

/** Ensure a session document exists; idempotent (no-op fields on repeat). Returns nothing. */
export async function ensureSession(sessionId: string): Promise<void> {
  const coll = await sessionsCollection();
  const now = new Date();
  await coll.updateOne(
    { sessionId },
    { $setOnInsert: { sessionId, createdAt: now, updatedAt: now } },
    { upsert: true },
  );
}

/** Load a session's saved state, or null if it doesn't exist. */
export async function getSession(sessionId: string): Promise<SessionDoc | null> {
  const coll = await sessionsCollection();
  return coll.findOne({ sessionId }, { projection: { _id: 0 } });
}

/** Autosave partial state for a session, creating it if necessary. */
export async function saveSession(sessionId: string, state: SessionState): Promise<void> {
  const coll = await sessionsCollection();
  const previous = state.pool !== undefined ? await getSession(sessionId) : null;
  const now = new Date();
  const set: Record<string, unknown> = { updatedAt: now };
  if (state.prefs !== undefined) set.prefs = state.prefs;
  if (state.pool !== undefined) set.pool = state.pool;
  if (state.scores !== undefined) set.scores = state.scores;

  await coll.updateOne(
    { sessionId },
    { $set: set, $setOnInsert: { sessionId, createdAt: now } },
    { upsert: true },
  );

  if (state.pool !== undefined) {
    // Predictor guardrail: exclude starter-set ids from the co-occurrence writer so real
    // users don't inflate the curated iconic games into universal popularity hubs. Their
    // edges stay anchored by the persona-seeded data only.
    await ensureStarterIdsResolved();
    const starterIds = getStarterSetIds();
    await updatePoolPatternAggregates(
      filterStarterIds(previous?.pool ?? [], starterIds),
      filterStarterIds(state.pool, starterIds),
    );
  }
}
