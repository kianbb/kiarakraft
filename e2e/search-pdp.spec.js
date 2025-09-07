// @ts-check
const { test, expect } = require('@playwright/test');

const base = process.env.PREVIEW_URL;

test.describe('Search → PDP', () => {
  test.beforeAll(() => {
    test.skip(!base, 'PREVIEW_URL not set; skipping e2e tests');
  });

  test('open explore with query and navigate to product', async ({ page }) => {
    await page.goto(`${base}/fa/explore?q=%D8%B8%D8%B1%D9%81`); // Persian query example
    await expect(
      page.getByRole('heading', { name: /نتایج جستجو|Explore/i })
    ).toBeVisible();

    // Click first product card if present
    const firstCard = page.locator('a[href*="/fa/product/"]').first();
    const hasCard = await firstCard.count();
    if (hasCard > 0) {
      await firstCard.click();
      await expect(page).toHaveURL(/\/fa\/product\//);
    } else {
      test.skip(true, 'No products available in explore');
    }
  });
});
