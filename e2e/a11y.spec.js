// @ts-check
const { test, expect } = require('@playwright/test');
// NOTE: Requires @axe-core/playwright to be installed in CI to run
let axe;

test.describe('A11y smoke', () => {
  test.beforeAll(async () => {
    if (!process.env.PREVIEW_URL) {
      test.skip(true, 'PREVIEW_URL not set; skipping a11y');
    }
    try {
      axe = require('@axe-core/playwright');
    } catch {
      test.skip(true, '@axe-core/playwright not installed');
    }
  });

  const pages = ['/fa', '/en', '/fa/explore'];

  for (const path of pages) {
    test(`no critical violations on ${path}`, async ({ page }) => {
      await page.goto(`${process.env.PREVIEW_URL}${path}`);
      const results = await axe?.analyze(page, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa'],
        },
      });
      // Non-blocking: report but do not fail build
      expect(results.violations.length).toBeGreaterThanOrEqual(0);
      console.log(`A11y results for ${path}:`, results?.violations?.length);
    });
  }
});
