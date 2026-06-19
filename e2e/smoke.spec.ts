import { expect, test } from '@playwright/test';

test('landing page shows the welcome hero and shell', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /rank the games you actually love/i }),
  ).toBeVisible();
  // The persistent shell: wordmark + always-visible mute toggle.
  await expect(page.getByText('Ultimate Tier List')).toBeVisible();
  await expect(page.getByRole('switch', { name: /mute sound|unmute sound/i })).toBeVisible();
});

test('advances from welcome into the flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /start ranking/i }).click();
  await expect(page.getByRole('heading', { name: /what do you reach for/i })).toBeVisible();
});

test('health endpoint reports ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});
