import type { Tier } from '@/lib/ranking';

export interface TierRect {
  tier: Tier;
  /** Page-coordinate bounds of a tier row's drop area (getBoundingClientRect + scroll). */
  rect: { top: number; bottom: number; left: number; right: number };
}

/** A resolved drop: which tier row the cursor landed in, and where inside that row. */
export interface DropTarget {
  tier: Tier;
  /** Insertion index within the target tier (0..length). */
  index: number;
}

/**
 * Pure hit-test: which tier row (if any) contains the drop point. Both inputs are in page
 * coordinates. Kept separate from the component so the drag-to-move mapping is unit-testable.
 */
export function tierAtPoint(point: { x: number; y: number }, rects: TierRect[]): Tier | null {
  for (const { tier, rect } of rects) {
    if (
      point.x >= rect.left &&
      point.x <= rect.right &&
      point.y >= rect.top &&
      point.y <= rect.bottom
    ) {
      return tier;
    }
  }
  return null;
}

/**
 * Pure horizontal hit-test: where in a row the drop point should insert. `cardCenters` are the
 * page-x centers of the cards already in that row (excluding the dragged card), left to right.
 * Returns the index before the first card whose center is to the right of the point, else the
 * length (append at the end).
 */
export function insertionIndex(pointX: number, cardCenters: number[]): number {
  for (let i = 0; i < cardCenters.length; i += 1) {
    if (pointX < cardCenters[i]) return i;
  }
  return cardCenters.length;
}

/**
 * Move a game id out of whatever tier holds it and insert it into `to` at `toIndex`. Omit
 * `toIndex` (or pass undefined) to append, matching the original append-only behavior. Returns a
 * new TierMap and leaves the original untouched.
 */
export function moveInTierMap(
  tiers: Record<Tier, number[]>,
  gameId: number,
  to: Tier,
  toIndex?: number,
): Record<Tier, number[]> {
  const next = {} as Record<Tier, number[]>;
  for (const tier of Object.keys(tiers) as Tier[]) {
    next[tier] = tiers[tier].filter((id) => id !== gameId);
  }
  if (next[to].includes(gameId)) return next;

  const idx =
    typeof toIndex === 'number'
      ? Math.max(0, Math.min(Math.trunc(toIndex), next[to].length))
      : next[to].length;
  next[to].splice(idx, 0, gameId);
  return next;
}
