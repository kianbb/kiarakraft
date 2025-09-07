// @ts-check
const { test, expect } = require('@playwright/test');

const base = process.env.PREVIEW_URL;

test.describe('Locale switch', () => {
  test.beforeAll(() => {
    test.skip(!base, 'PREVIEW_URL not set; skipping e2e tests');
  });

  test('fa → en and back', async ({ page }) => {
    await page.goto(`${base}/fa`);
    await expect(page).toHaveURL(/\/fa/);

    // Navigate to EN
    await page.goto(`${base}/en`);
    await expect(page).toHaveURL(/\/en/);

    // Back to FA
    await page.goto(`${base}/fa`);
    await expect(page).toHaveURL(/\/fa/);
  });
});
