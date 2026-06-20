import { expect, test, type Page } from '@playwright/test';

/**
 * Drag-and-drop on the editable reveal board (Phases 8 + 9): cross-tier moves and within-tier
 * reordering. Covers the "snaps back" regression where an off-center grab would land the card
 * center in its original tier even though the cursor reached the target row. The drop is resolved
 * against the cursor position (info.point), not the card center.
 *
 * Mouse-drag is a desktop interaction; on touch devices the TierPicker (tap-to-move) is the
 * primary path, so these specs run only on the desktop-chromium project.
 */
test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chromium',
    'mouse drag-and-drop is a desktop interaction',
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

/** Build a pool, blast through the arcade, and land on the editable reveal board. */
async function reachEditableBoard(page: Page) {
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

  const reveal = page.getByRole('button', { name: /reveal my tier list/i });
  const skip = page.getByRole('button', { name: /skip round/i });
  for (let i = 0; i < 25 && !(await reveal.isVisible().catch(() => false)); i += 1) {
    await skip.click();
  }
  await reveal.click();
  await expect(page.getByText(/your tier list/i)).toBeVisible();

  // Skip the staggered reveal so the board is immediately editable.
  await page.getByRole('button', { name: /reveal all/i }).click();
}

/** The movable cover's aria-label is `Move {title}`; strip the prefix to get the title. */
function titleFromLabel(label: string): string {
  return label.replace(/^Move /, '');
}

test('a cover can be moved into a different tier', async ({ page }) => {
  await reachEditableBoard(page);

  // With the mock (rating 80 → ~1510), every game lands in B. Move the first one to S.
  const card = page.getByRole('button', { name: /^Move Suggested / }).first();
  await expect(card).toBeVisible();
  const label = (await card.getAttribute('aria-label')) ?? '';
  const title = titleFromLabel(label);

  const sRow = page.getByTestId('tier-row-S');
  await card.click();
  await page.getByRole('button', { name: /move to s tier/i }).click();

  await expect(sRow.getByText(title, { exact: true })).toBeVisible();
});

test('a cover can be reordered within its tier', async ({ page }) => {
  await reachEditableBoard(page);

  const bRow = page.getByTestId('tier-row-B');
  const cards = bRow.getByRole('button', { name: /^Move Suggested / });
  await expect(cards.nth(0)).toBeVisible();
  await expect(cards.nth(1)).toBeVisible();

  const firstBox = await cards.nth(0).boundingBox();
  const secondBox = await cards.nth(1).boundingBox();
  if (!firstBox || !secondBox) throw new Error('missing card boxes');

  const firstLabel = (await cards.nth(0).getAttribute('aria-label')) ?? '';
  const secondLabel = (await cards.nth(1).getAttribute('aria-label')) ?? '';
  const firstTitle = titleFromLabel(firstLabel);
  const secondTitle = titleFromLabel(secondLabel);

  // Drag the second cover to just left of the first cover's center (still inside the B row) so
  // it inserts at index 0. Keep the y within the row so it stays in B.
  const grabX = secondBox.x + secondBox.width / 2;
  const grabY = secondBox.y + secondBox.height / 2;
  const dropX = firstBox.x + Math.min(8, firstBox.width / 4);
  const dropY = grabY;

  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX, grabY - 10, { steps: 5 });
  await page.mouse.move(dropX, dropY, { steps: 30 });
  await page.mouse.up();

  // The second cover is now first in B; the former first is now second.
  await expect(cards.nth(0)).toHaveAttribute('aria-label', `Move ${secondTitle}`);
  await expect(cards.nth(1)).toHaveAttribute('aria-label', `Move ${firstTitle}`);
});
