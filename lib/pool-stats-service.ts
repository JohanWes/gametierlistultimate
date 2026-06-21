import { getStarterSet } from './games/repo';
import { getStarterSetIds, setResolvedStarterIds } from './games/starter-set';
import { updatePoolPatternAggregates } from './pool-patterns-repo';

/**
 * Record a pool delta into the anonymous community aggregates (`gamePoolStats` /
 * `gameCooccurrence`). This is the only server-side residue of the old session save: the
 * full in-progress state now lives in the browser, but the co-occurrence signal that powers
 * personalized suggestions is still collected here via a write-only endpoint.
 */

/* ------------------------------------------------------------------ starter guardrail */

/**
 * Once-per-process flag: have we attempted to resolve the starter-set ids? On serverless cold
 * starts the module-level cache in `starter-set.ts` is empty (the suggestions API that normally
 * populates it ran in a different invocation), so the first recording resolves the ids itself.
 * The flag prevents re-scanning the games collection on every subsequent call in the same process.
 */
let starterResolutionAttempted = false;

/** Test-only: reset the guardrail so each test starts with a clean cache and flag. */
export function resetStarterGuardrail(): void {
  starterResolutionAttempted = false;
  setResolvedStarterIds([]);
}

/**
 * Ensure the starter-set id cache is populated. No-op if the suggestions API already populated it
 * (same process, warm invocation). Best-effort: if resolution throws (transient DB error) the flag
 * is NOT set so the next call retries; if it succeeds but returns empty (no matching games) the
 * flag IS set because retrying won't help.
 */
async function ensureStarterIdsResolved(): Promise<void> {
  if (starterResolutionAttempted) return;
  if (getStarterSetIds().size > 0) return;
  try {
    await getStarterSet();
    starterResolutionAttempted = true;
  } catch {
    // Transient failure — leave the flag false so the next call retries resolution.
  }
}

/** Filter starter-set ids out of a pool so they don't inflate co-occurrence hubs. */
function filterStarterIds(pool: number[], starterIds: Set<number>): number[] {
  if (starterIds.size === 0) return pool;
  return pool.filter((id) => !starterIds.has(id));
}

/**
 * Apply a previous→next pool delta to the community aggregates, excluding curated starter-set ids
 * so real users don't inflate the seeded persona clusters into universal popularity hubs.
 */
export async function recordPoolDelta(previous: number[], next: number[]): Promise<void> {
  await ensureStarterIdsResolved();
  const starterIds = getStarterSetIds();
  await updatePoolPatternAggregates(
    filterStarterIds(previous, starterIds),
    filterStarterIds(next, starterIds),
  );
}
