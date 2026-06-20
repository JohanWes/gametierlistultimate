import type { ComparisonResult } from './compare';
import type { TierMap } from './ranking';

export type { ComparisonResult, Outlier } from './compare';

/** A graceful empty result for any network/parse failure — the panel just shows low-data copy. */
const EMPTY: ComparisonResult = { similarityPercent: null, outliers: [], sampleSize: 0 };

async function readResult(res: Response): Promise<ComparisonResult> {
  if (!res.ok) return EMPTY;
  const data = (await res.json().catch(() => null)) as Partial<ComparisonResult> | null;
  if (!data || !Array.isArray(data.outliers)) return EMPTY;
  return {
    similarityPercent:
      typeof data.similarityPercent === 'number' ? data.similarityPercent : null,
    outliers: data.outliers,
    sampleSize: typeof data.sampleSize === 'number' ? data.sampleSize : 0,
  };
}

/**
 * Browser wrappers around the comparison endpoints, mirroring `lib/games/client.ts`: an
 * injectable `fetchImpl` for unit tests, and tolerant parsing so a transient failure degrades to
 * the low-data state rather than throwing into the reveal UI.
 */

/** POST /api/compare — compare the owner's current (pre-publish) tiers to the community. */
export async function fetchComparison(
  tiers: TierMap,
  fetchImpl: typeof fetch = fetch,
): Promise<ComparisonResult> {
  try {
    const res = await fetchImpl('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ tiers }),
    });
    return await readResult(res);
  } catch {
    return EMPTY;
  }
}

/** GET /api/lists/:shareId/comparison — how a published list compares to the community. */
export async function fetchSharedComparison(
  shareId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ComparisonResult> {
  try {
    const res = await fetchImpl(`/api/lists/${shareId}/comparison`, {
      credentials: 'same-origin',
    });
    return await readResult(res);
  } catch {
    return EMPTY;
  }
}
