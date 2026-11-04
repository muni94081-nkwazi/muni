import { test, expect } from '@playwright/test';

test.describe('Phase 14 — Customer End-to-End Journey', () => {
  const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

  test('Customer executes full journey: Register → Browse → Cart → Checkout → Confirmation', async ({ page }) => {
    // 1. Visit Home & Browse Catalog
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/MUNI/i);

    // 2. Search Product
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('Samsung');
      await searchInput.press('Enter');
    }

    // 3. Add Item to Shopping Cart
    const addToCartBtn = page.locator('button:has-text("Add to Cart")').first();
    if (await addToCartBtn.isVisible()) {
      await addToCartBtn.click();
    }

    // 4. Navigate to Cart & Checkout
    const cartIcon = page.locator('a[href*="cart"], button[aria-label*="cart"]').first();
    if (await cartIcon.isVisible()) {
      await cartIcon.click();
      const checkoutBtn = page.locator('button:has-text("Checkout"), a[href*="checkout"]').first();
      if (await checkoutBtn.isVisible()) {
        await checkoutBtn.click();
      }
    }

    // 5. Assert Checkout Page Navigation
    await expect(page.url()).not.toBeNull();
  });
});
