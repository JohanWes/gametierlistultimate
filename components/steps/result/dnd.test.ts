import { afterEach, describe, expect, it } from 'vitest';

import {
  insertionIndex,
  moveInTierMap,
  pageRectOf,
  tierAtPoint,
  zoneIndexAtPagePoint,
  type TierRect,
} from './dnd';

/** A stand-in element with a fixed viewport rect (only what the hit-test reads). */
function fakeEl(rect: { top: number; bottom: number; left: number; right: number }): Element {
  return {
    getBoundingClientRect: () => ({ ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top }),
  } as unknown as Element;
}

function setScroll(x: number, y: number) {
  Object.defineProperty(window, 'scrollX', { value: x, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
}

const rects: TierRect[] = [
  { tier: 'S', rect: { top: 0, bottom: 100, left: 0, right: 500 } },
  { tier: 'A', rect: { top: 100, bottom: 200, left: 0, right: 500 } },
  { tier: 'B', rect: { top: 200, bottom: 300, left: 0, right: 500 } },
];

describe('tierAtPoint', () => {
  it('returns the tier whose row contains the point', () => {
    expect(tierAtPoint({ x: 50, y: 150 }, rects)).toBe('A');
    expect(tierAtPoint({ x: 50, y: 250 }, rects)).toBe('B');
  });

  it('returns null when the point is outside every row', () => {
    expect(tierAtPoint({ x: 50, y: 999 }, rects)).toBeNull();
    expect(tierAtPoint({ x: 999, y: 50 }, rects)).toBeNull();
  });
});

describe('pageRectOf', () => {
  afterEach(() => setScroll(0, 0));

  it('returns the raw viewport rect when the page is not scrolled', () => {
    setScroll(0, 0);
    expect(pageRectOf(fakeEl({ top: 10, bottom: 110, left: 20, right: 220 }))).toEqual({
      top: 10,
      bottom: 110,
      left: 20,
      right: 220,
    });
  });

  it('shifts the rect into page space by the window scroll', () => {
    setScroll(30, 200);
    expect(pageRectOf(fakeEl({ top: 10, bottom: 110, left: 20, right: 220 }))).toEqual({
      top: 210,
      bottom: 310,
      left: 50,
      right: 250,
    });
  });
});

describe('zoneIndexAtPagePoint', () => {
  afterEach(() => setScroll(0, 0));

  const zones = [
    fakeEl({ top: 0, bottom: 100, left: 0, right: 100 }),
    fakeEl({ top: 0, bottom: 100, left: 100, right: 200 }),
    fakeEl({ top: 0, bottom: 100, left: 200, right: 300 }),
  ];

  it('returns the index of the zone containing the point', () => {
    expect(zoneIndexAtPagePoint({ x: 50, y: 50 }, zones)).toBe(0);
    expect(zoneIndexAtPagePoint({ x: 150, y: 50 }, zones)).toBe(1);
    expect(zoneIndexAtPagePoint({ x: 250, y: 50 }, zones)).toBe(2);
  });

  it('returns -1 when the point is outside every zone', () => {
    expect(zoneIndexAtPagePoint({ x: 50, y: 999 }, zones)).toBe(-1);
  });

  it('skips null refs', () => {
    expect(zoneIndexAtPagePoint({ x: 150, y: 50 }, [null, ...zones])).toBe(2);
  });

  it('matches a page-coordinate point against scrolled zones', () => {
    setScroll(0, 500);
    // The zones sit at viewport y 0..100, i.e. page y 500..600 when scrolled down 500.
    expect(zoneIndexAtPagePoint({ x: 150, y: 550 }, zones)).toBe(1);
    // A point in viewport space (no scroll added) would now miss.
    expect(zoneIndexAtPagePoint({ x: 150, y: 50 }, zones)).toBe(-1);
  });
});

describe('insertionIndex', () => {
  const centers = [100, 300, 500];

  it('inserts at the start when the point is left of every card', () => {
    expect(insertionIndex(20, centers)).toBe(0);
  });

  it('inserts before the first card whose center is to the right', () => {
    expect(insertionIndex(150, centers)).toBe(1);
    expect(insertionIndex(350, centers)).toBe(2);
  });

  it('appends when the point is right of every card', () => {
    expect(insertionIndex(900, centers)).toBe(3);
  });

  it('handles an empty row', () => {
    expect(insertionIndex(150, [])).toBe(0);
  });
});

describe('moveInTierMap', () => {
  const tiers = { S: [1], A: [2, 3], B: [], C: [], D: [], E: [], F: [] };

  it('moves a game out of its old tier into the target (append by default)', () => {
    const next = moveInTierMap(tiers, 2, 'S');
    expect(next.S).toEqual([1, 2]);
    expect(next.A).toEqual([3]);
  });

  it('inserts at the given index within the target tier', () => {
    const next = moveInTierMap(tiers, 2, 'S', 0);
    expect(next.S).toEqual([2, 1]);
  });

  it('reorders within the same tier', () => {
    const next = moveInTierMap(tiers, 3, 'A', 0);
    expect(next.A).toEqual([3, 2]);
  });

  it('clamps an out-of-range index to the end', () => {
    const next = moveInTierMap(tiers, 2, 'B', 99);
    expect(next.B).toEqual([2]);
  });

  it('clamps a negative index to the start', () => {
    const next = moveInTierMap(tiers, 2, 'A', -3);
    expect(next.A).toEqual([2, 3]);
  });

  it('does not duplicate when moving within the same tier to an append index', () => {
    const next = moveInTierMap({ ...tiers, A: [2, 3, 4] }, 3, 'A');
    expect(next.A).toEqual([2, 4, 3]);
  });

  it('does not duplicate when moving within the same tier and index', () => {
    const next = moveInTierMap(tiers, 1, 'S');
    expect(next.S).toEqual([1]);
  });

  it('leaves the original untouched', () => {
    moveInTierMap(tiers, 2, 'B');
    expect(tiers.A).toEqual([2, 3]);
  });
});
