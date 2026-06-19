import { expect, test } from '@playwright/test';

/**
 * Full Step 1 → Step 2 walk: landing → preferences → game pool. Runs under both the
 * desktop-chromium and mobile-chrome projects (see playwright.config.ts), so it covers
 * mouse and touch viewports without per-test branching.
 */
test('onboarding flow: start, pick genres, continue to the pool', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /press start/i }).click();
  await expect(page.getByRole('heading', { name: /what do you reach for/i })).toBeVisible();

  // Pick a few genres — order/identity doesn't matter, just that selection works.
  for (const genre of ['RPG', 'Action', 'Horror']) {
    await page.getByRole('checkbox', { name: genre, exact: true }).click();
    await expect(page.getByRole('checkbox', { name: genre, exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  }

  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByRole('heading', { name: /add the games you/i })).toBeVisible();
});
