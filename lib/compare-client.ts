import type { ComparisonResult } from './compare';
import type { TierMap } from './ranking';

export type { ComparisonResult, Outlier } from './compare';

/** A graceful empty result for any network failure — the panel just shows low-data copy. */
const EMPTY: ComparisonResult = { similarityPercent: null, outliers: [], sampleSize: 0 };

/**
 * POST /api/compare — compare the owner's current (pre-publish) tiers to the community. A failed
 * request degrades to the low-data state rather than throwing into the reveal UI.
 */
export async function fetchComparison(tiers: TierMap): Promise<ComparisonResult> {
  try {
    const res = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ tiers }),
    });
    return res.ok ? ((await res.json()) as ComparisonResult) : EMPTY;
  } catch {
    return EMPTY;
  }
}
