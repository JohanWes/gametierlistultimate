import { expect, test, type Page } from '@playwright/test';

function fixtureGame(id: number) {
  return {
    igdbId: id,
    title: `Saved ${id}`,
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

async function mockSavedArcadeSession(page: Page) {
  const ids = Array.from({ length: 12 }, (_, i) => i + 1);
  const games = ids.map(fixtureGame);

  await page.route('**/api/session', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ json: { sessionId: 'saved-session' } });
      return;
    }
    await route.fulfill({ json: { session: { pool: ids, step: 'arcade' } } });
  });

  await page.route('**/api/games/by-ids*', async (route) => {
    await route.fulfill({ json: { games } });
  });
}

test('resumes the saved step after a full page load', async ({ page }) => {
  await mockSavedArcadeSession(page);

  await page.goto('/');

  await expect(page.getByText(/ranking arcade/i)).toBeVisible();
  await expect(page.getByTestId('arcade-round')).toHaveText('0');

  await page.reload();

  await expect(page.getByText(/ranking arcade/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /press start/i })).toHaveCount(0);
});
