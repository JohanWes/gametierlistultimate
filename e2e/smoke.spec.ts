import { expect, test } from '@playwright/test';

test('landing page shows the app title', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ultimate Game Tier List' })).toBeVisible();
});

test('health endpoint reports ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});
