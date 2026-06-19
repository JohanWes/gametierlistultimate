import { COLLECTIONS, getDb } from './mongo';
import { updatePoolPatternAggregates } from './pool-patterns-repo';

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
    await updatePoolPatternAggregates(previous?.pool ?? [], state.pool);
  }
}
