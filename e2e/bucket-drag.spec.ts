import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'bucket mouse drag is covered on the desktop browser path',
  );
});

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

async function buildPoolAndReachBucket(page: Page) {
  await mockGameApis(page);
  await page.goto('/');

  await page.getByRole('button', { name: /press start/i }).click();
  await page.getByRole('button', { name: /continue/i }).click();

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

  await page.getByRole('button', { name: /enter the arcade/i }).click();
  await expect(page.getByText(/ranking arcade/i)).toBeVisible();

  const bucketHeading = page.getByRole('heading', { name: /sort them into buckets/i });
  const skip = page.getByRole('button', { name: /skip round/i });
  for (let i = 0; i < 10 && !(await bucketHeading.isVisible().catch(() => false)); i += 1) {
    await skip.click();
    await page.waitForTimeout(300);
  }
  await expect(bucketHeading).toBeVisible();
}

function titleFromLabel(label: string): string {
  return label.replace(/^Place /, '');
}

test('a bucket cover can be dragged into a bucket on first press', async ({ page }) => {
  await buildPoolAndReachBucket(page);

  const card = page.getByRole('button', { name: /^Place Suggested / }).first();
  const top = page.getByRole('button', { name: /^Top bucket$/i });
  await expect(card).toBeVisible();
  await expect(top).toBeVisible();

  const label = (await card.getAttribute('aria-label')) ?? '';
  const title = titleFromLabel(label);
  const cardBox = await card.boundingBox();
  const topBox = await top.boundingBox();
  if (!cardBox || !topBox) throw new Error('missing bucket drag boxes');

  const grabX = cardBox.x + cardBox.width / 2;
  const grabY = cardBox.y + cardBox.height / 2;
  const dropX = topBox.x + topBox.width / 2;
  const dropY = topBox.y + topBox.height / 2;

  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + 12, grabY - 12, { steps: 4 });
  await page.mouse.move(dropX, dropY, { steps: 24 });
  await page.mouse.up();

  await expect(top.getByText(title, { exact: true })).toBeVisible();
});
