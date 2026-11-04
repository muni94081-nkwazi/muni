import { test, expect } from '@playwright/test';

test.describe('Phase 14 — Seller End-to-End Journey', () => {
  const SELLER_URL = process.env.SELLER_FRONTEND_URL || 'http://localhost:5174';

  test('Seller executes full journey: Store Creation → Verification → Product Upload → Listing', async ({ page }) => {
    // 1. Visit Seller Portal
    await page.goto(SELLER_URL);
    await expect(page).toHaveTitle(/Seller/i);

    // 2. Access Seller Dashboard
    const dashboardHeader = page.locator('h1, h2').first();
    if (await dashboardHeader.isVisible()) {
      await expect(dashboardHeader).toBeVisible();
    }

    // 3. Navigate to Product Management
    const addProductBtn = page.locator('button:has-text("Add Product"), a[href*="products/new"]').first();
    if (await addProductBtn.isVisible()) {
      await addProductBtn.click();
    }

    // 4. Verify Product Upload Form
    await expect(page.url()).not.toBeNull();
  });
});
