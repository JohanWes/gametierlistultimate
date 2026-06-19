import { expect, test } from '@playwright/test';

/**
 * Visual smoke at two viewports (per Phase 3 acceptance criteria): the shell and primitives
 * must render usably from a 360px phone up to an ultrawide desktop.
 */
const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'ultrawide', width: 1920, height: 1080 },
] as const;

for (const vp of VIEWPORTS) {
  test(`shell + hero render at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: /create your game tier list/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /start ranking/i })).toBeVisible();
    await expect(page.getByRole('switch', { name: /mute sound|unmute sound/i })).toBeVisible();

    // No horizontal overflow at either width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
