import { expect, test, type Page } from '@playwright/test';

/**
 * Pool building (Step 3). CI has no live Mongo, so the game APIs are mocked at the browser
 * with page.route: suggestions return a fresh batch of 5 each call (keyed off the growing
 * exclude list) and search returns one canned hit. Builds a pool from batches plus a manual
 * search, then advances into the arcade. Runs under desktop-chromium and mobile-chrome.
 */

interface FixtureGame {
  igdbId: number;
  title: string;
  coverUrl: null;
  genres: string[];
  platforms: string[];
  releaseYear: number;
  popularity: null;
  rating: number;
  summary: null;
  hasCover: false;
  category: number;
}

function fixtureGame(id: number, title: string): FixtureGame {
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
    // Fresh ids each batch (exclude grows by 5), kept clear of the search fixture's range.
    const start = 1000 + exclude.length;
    const games = Array.from({ length: 5 }, (_, i) => fixtureGame(start + i, `Suggested ${start + i}`));
    await route.fulfill({ json: { games } });
  });

  await page.route('**/api/games/search*', async (route) => {
    await route.fulfill({
      json: { results: [{ ...fixtureGame(9999, 'Searched Classic'), source: 'local' }], source: 'local' },
    });
  });
}

test('build a pool from batches + search, then enter the arcade', async ({ page }) => {
  await mockGameApis(page);
  await page.goto('/');

  // Welcome → onboarding → pool.
  await page.getByRole('button', { name: /press start/i }).click();
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByRole('heading', { name: /add the games you/i })).toBeVisible();

  // Manual search adds one game.
  await page.getByRole('searchbox', { name: /search games/i }).fill('classic');
  await page.getByRole('button', { name: /searched classic/i }).click();
  await expect(page.getByRole('button', { name: /added/i })).toBeVisible();

  // Include games from batches until the arcade unlocks (the minimum is 12).
  const enterArcade = page.getByRole('button', { name: /enter the arcade/i });
  const rosterCount = page.getByTestId('roster-count');
  await expect(enterArcade).toBeDisabled();

  const poolSize = async () => Number((await rosterCount.textContent()) ?? '0');

  for (let i = 0; i < 60 && (await poolSize()) < 12; i += 1) {
    const before = await poolSize();
    await page.getByRole('button', { name: /played it/i }).first().click();
    // A random spotlight roll on Played it reveals a status picker — pick one to commit the include.
    const finished = page.getByRole('button', { name: /^finished$/i });
    if (await finished.isVisible().catch(() => false)) {
      await finished.click({ force: true }).catch(() => undefined);
    }
    // Wait for the include to register. Cards stay in fixed slots (no reflow),
    // so clicks are reliable — the catch is a belt-and-suspenders guard.
    await expect
      .poll(poolSize, { timeout: 2000 })
      .toBeGreaterThan(before)
      .catch(() => undefined);
  }

  await expect(enterArcade).toBeEnabled();
  await enterArcade.click();

  // The arcade step is reached. The exact first minigame can vary.
  await expect(page.getByText(/ranking arcade/i)).toBeVisible();
});
