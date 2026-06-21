import type { Step } from '@/lib/flow';
import type { PlayedStatus, PoolEntry, PrefsState } from '@/lib/store';

/**
 * Fully local, browser-persisted in-progress flow state. This replaces the old server-side
 * `sessions` collection: anonymous, single-device, non-shareable progress lives here so resume
 * needs zero network. The mute pref stays in its own `gtl_sound` key (see lib/store).
 */
export const LOCAL_SESSION_KEY = 'gtl_session_state';

export interface LocalSessionState {
  prefs: PrefsState;
  /** Full game objects (with played status) so resume never refetches. */
  pool: PoolEntry[];
  scores: Record<string, unknown>;
  step: Step;
}

const VALID_STATUS: ReadonlySet<string> = new Set<PlayedStatus>([
  'tried',
  'finished',
  'played-a-lot',
]);

/** Validate a parsed blob into a PoolEntry[], dropping anything malformed. */
function parsePool(value: unknown): PoolEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: PoolEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const { game, status } = raw as { game?: unknown; status?: unknown };
    if (!game || typeof game !== 'object') continue;
    if (typeof (game as { igdbId?: unknown }).igdbId !== 'number') continue;
    entries.push({
      game: game as PoolEntry['game'],
      status: VALID_STATUS.has(status as string) ? (status as PlayedStatus) : 'finished',
    });
  }
  return entries;
}

/** Read saved local state, or null if absent/unparseable. Never throws. */
export function loadLocalSession(): LocalSessionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<LocalSessionState>;
    if (!data || typeof data !== 'object') return null;
    const prefs = data.prefs && typeof data.prefs === 'object' ? (data.prefs as PrefsState) : null;
    return {
      prefs: prefs ?? { genres: [], platforms: [], flags: {} },
      pool: parsePool(data.pool),
      scores:
        data.scores && typeof data.scores === 'object'
          ? (data.scores as Record<string, unknown>)
          : {},
      step: (data.step as Step) ?? 'welcome',
    };
  } catch {
    return null;
  }
}

/** Persist local state. Best-effort — swallows private-mode / quota errors. */
export function saveLocalSession(state: LocalSessionState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable or over quota — non-essential */
  }
}

/** Remove saved local state (e.g. start over). Never throws. */
export function clearLocalSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}
