// @ts-check
const { test, expect } = require('@playwright/test');

const base = process.env.PREVIEW_URL;
const USER = process.env.TEST_USER_EMAIL;
const PASS = process.env.TEST_USER_PASSWORD;

async function login(page, locale = 'fa') {
  await page.goto(`${base}/${locale}/auth/login`);
  await page.fill('#email', USER);
  await page.fill('#password', PASS);
  await page.getByRole('button', { name: /login|ورود|sign in/i }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}(/|$)`));
}

test.describe('Wishlist + Checkout (offline)', () => {
  test.beforeAll(() => {
    test.skip(
      !base || !USER || !PASS,
      'Missing PREVIEW_URL or test credentials'
    );
  });

  test('add to wishlist and begin checkout', async ({ page }) => {
    await login(page, 'fa');

    // Navigate to explore and open first product
    await page.goto(`${base}/fa/explore`);
    const firstCard = page.locator('a[href*="/fa/product/"]').first();
    const hasCard = await firstCard.count();
    if (hasCard === 0) test.skip(true, 'No products available');
    await firstCard.click();
    await expect(page).toHaveURL(/\/fa\/product\//);

    // Add to wishlist if button is present
    const heart = page.locator('button[aria-label*="wishlist" i]');
    if ((await heart.count()) > 0) {
      await heart.first().click();
    }

    // Add to cart
    const addToCart = page.getByRole('button', {
      name: /اضافه به سبد|add to cart/i,
    });
    if ((await addToCart.count()) > 0) {
      await addToCart.click();
    }

    // Go to checkout (does not complete payment here)
    await page.goto(`${base}/fa/checkout`);
    await expect(
      page.getByRole('heading', { name: /تسویه|checkout/i })
    ).toBeVisible();
  });
});
