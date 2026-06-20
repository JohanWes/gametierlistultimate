import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 11 — community comparison. Reuses the arcade flow to reach the reveal, mocks the
 * comparison endpoint for determinism, and confirms the low-key gauge auto-loads with a
 * percentage and expandable outliers. Runs on desktop + mobile-chrome (mouse + touch).
 */

function fixtureGame(id: number, title: string) {
  return {
    igdbId: id,
    title,
    coverUrl: null,
    genres: ['Action'],
    platforms: ['PC'],
    releaseYear: 2015,
    popularity: null,
    rating: 80,
    summary: null,
    hasCover: false,
    category: 0,
  };
}

async function mockApis(page: Page) {
  await page.route('**/api/games/suggestions*', async (route) => {
    const url = new URL(route.request().url());
    const exclude = (url.searchParams.get('exclude') ?? '').split(',').filter(Boolean);
    const start = 1000 + exclude.length;
    const games = Array.from({ length: 5 }, (_, i) =>
      fixtureGame(start + i, `Suggested ${start + i}`),
    );
    await route.fulfill({ json: { games } });
  });
  await page.route('**/api/session*', async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
  // Deterministic community comparison — no DB dependency.
  await page.route('**/api/compare', async (route) => {
    await route.fulfill({
      json: {
        similarityPercent: 92,
        sampleSize: 1204,
        outliers: [
          { gameId: 1000, userTier: 'S', communityTier: 'C', direction: 'higher' },
          { gameId: 1001, userTier: 'F', communityTier: 'S', direction: 'lower' },
        ],
      },
    });
  });
}

async function reachReveal(page: Page) {
  await mockApis(page);
  await page.goto('/');

  await page.getByRole('button', { name: /press start/i }).click();
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByRole('heading', { name: /add the games you/i })).toBeVisible();

  const enterArcade = page.getByRole('button', { name: /enter the arcade/i });
  const rosterCount = page.getByTestId('roster-count');
  const poolSize = async () => Number((await rosterCount.textContent()) ?? '0');

  for (let i = 0; i < 80 && (await poolSize()) < 12; i += 1) {
    const before = await poolSize();
    await page.getByRole('button', { name: /played it/i }).first().click();
    const finished = page.getByRole('button', { name: /^finished$/i });
    if (await finished.isVisible().catch(() => false)) {
      await finished.click({ force: true }).catch(() => undefined);
    }
    await expect.poll(poolSize, { timeout: 2000 }).toBeGreaterThan(before).catch(() => undefined);
  }

  await expect(enterArcade).toBeEnabled();
  await enterArcade.click();
  await expect(page.getByText(/ranking arcade/i)).toBeVisible();

  await page.getByRole('button', { name: /^Suggested \d+$/ }).first().click();

  // Drive to the reveal: skip rounds until the reveal unlocks, then click it. The button can
  // flicker as confidence oscillates between rounds, so keep going until the result page lands.
  const reveal = page.getByRole('button', { name: /reveal my tier list/i });
  const skip = page.getByRole('button', { name: /skip round/i });
  const onResult = page.getByText(/your tier list/i);
  for (let i = 0; i < 40 && !(await onResult.isVisible().catch(() => false)); i += 1) {
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click({ force: true }).catch(() => undefined);
    } else if (await skip.isVisible().catch(() => false)) {
      await skip.click({ force: true }).catch(() => undefined);
    }
    await page.waitForTimeout(150);
  }
  await expect(onResult).toBeVisible();

  // Jump past the staggered reveal so the comparison panel mounts.
  await page.getByRole('button', { name: /reveal all/i }).click();
}

test('community gauge auto-loads on the reveal and expands its hot takes', async ({ page }) => {
  test.setTimeout(120_000); // full flow: pool build → arcade → reveal
  await reachReveal(page);

  // The low-key gauge appears with the similarity stat.
  await expect(page.getByText(/similar to the crowd/i)).toBeVisible();
  await expect(page.getByText('92', { exact: true })).toBeVisible();
  await expect(page.getByText(/based on 1,204 lists/i)).toBeVisible();

  // Tap to open the outlier drawer (works with touch on mobile-chrome).
  await page.getByRole('button', { name: /You match 92% of players/ }).click();
  await expect(page.getByText(/your hot takes/i)).toBeVisible();
  // Scope to the drawer's list — the title also appears on the tier board itself.
  await expect(page.getByRole('list').getByText('Suggested 1000')).toBeVisible();
});
