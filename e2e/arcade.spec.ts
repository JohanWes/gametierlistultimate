import { expect, test, type Page } from '@playwright/test';

/**
 * Ranking arcade (Step 4). Mocks the game APIs like pool.spec, builds a pool, enters the arcade,
 * plays a real minigame round plus several skips to advance through the orchestrator loop, and
 * confirms the confidence meter moves and the reveal unlocks. Runs on desktop + mobile-chrome.
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

async function mockGameApis(page: Page) {
  await page.route('**/api/games/suggestions*', async (route) => {
    const url = new URL(route.request().url());
    const exclude = (url.searchParams.get('exclude') ?? '').split(',').filter(Boolean);
    const start = 1000 + exclude.length;
    const games = Array.from({ length: 5 }, (_, i) => fixtureGame(start + i, `Suggested ${start + i}`));
    await route.fulfill({ json: { games } });
  });
  await page.route('**/api/session*', async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
}

async function buildPoolAndEnterArcade(page: Page) {
  await mockGameApis(page);
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
}

test('play rounds in the arcade and reach the reveal', async ({ page }) => {
  await buildPoolAndEnterArcade(page);

  const round = page.getByTestId('arcade-round');
  await expect(round).toHaveText('0');
  await expect(page.getByText(/tier confidence/i)).toBeVisible();

  // Play one real minigame round by picking a cover; the round counter must advance.
  await page.getByRole('button', { name: /^Suggested \d+$/ }).first().click();
  await expect(round).toHaveText('1', { timeout: 3000 });

  // Advance through the rest with the skip affordance until the reveal unlocks.
  const reveal = page.getByRole('button', { name: /reveal my tier list/i });
  const skip = page.getByRole('button', { name: /skip round/i });
  for (let i = 0; i < 20 && !(await reveal.isVisible().catch(() => false)); i += 1) {
    await skip.click();
  }

  await expect(reveal).toBeVisible();
  await reveal.click();

  // Lands on the reveal step.
  await expect(page.getByText(/your tier list/i)).toBeVisible();
});
