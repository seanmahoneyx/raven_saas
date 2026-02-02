import { test, expect } from '@playwright/test';

// Setup authenticated state before tests
test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');

    const usernameField = page.getByLabel(/username|email/i).or(page.getByPlaceholder(/username|email/i));
    const passwordField = page.getByLabel(/password/i).or(page.getByPlaceholder(/password/i));

    await usernameField.fill('testuser');
    await passwordField.fill('TestPassword123!');

    const submitButton = page.getByRole('button', { name: /login|sign in|submit/i });
    await submitButton.click();

    // Wait for redirect
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });
  });

  test('can navigate to Dashboard', async ({ page }) => {
    await page.goto('/');

    // Look for dashboard content or heading
    const dashboardIndicator = page.getByText(/dashboard|welcome|overview/i);
    await expect(dashboardIndicator.first()).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to Scheduler', async ({ page }) => {
    await page.goto('/scheduler');

    // Should see scheduler page elements
    await expect(page.getByText(/scheduler|schedule|calendar/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to Orders', async ({ page }) => {
    await page.goto('/orders');

    // Should see orders-related content
    await expect(page.getByText(/orders|sales|purchase/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to Items', async ({ page }) => {
    await page.goto('/items');

    // Should see items page
    await expect(page.getByText(/items|products|inventory/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to Contracts', async ({ page }) => {
    await page.goto('/contracts');

    // Should see contracts page
    await expect(page.getByText(/contracts|blanket/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to Parties', async ({ page }) => {
    await page.goto('/parties');

    // Should see parties/customers page
    await expect(page.getByText(/parties|customers|vendors/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to Inventory', async ({ page }) => {
    await page.goto('/inventory');

    // Should see inventory page
    await expect(page.getByText(/inventory|stock|warehouse/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to Shipping', async ({ page }) => {
    await page.goto('/shipping');

    // Should see shipping page
    await expect(page.getByText(/shipping|shipment|delivery/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to Invoices', async ({ page }) => {
    await page.goto('/invoices');

    // Should see invoices page
    await expect(page.getByText(/invoices|billing|payment/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to Reports', async ({ page }) => {
    await page.goto('/reports');

    // Should see reports page
    await expect(page.getByText(/reports|analytics|statistics/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('sidebar navigation is present', async ({ page }) => {
    await page.goto('/');

    // Look for navigation sidebar or menu
    const nav = page.locator('nav').or(page.getByRole('navigation'));
    await expect(nav.first()).toBeVisible({ timeout: 10000 });
  });
});
