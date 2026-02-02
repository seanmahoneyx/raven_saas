import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.context().clearCookies();
  });

  test('shows login page when not authenticated', async ({ page }) => {
    await page.goto('/');

    // Should redirect to login or show login form
    await expect(page.getByRole('heading', { name: /login|sign in/i })).toBeVisible({ timeout: 10000 });
  });

  test('login form has required fields', async ({ page }) => {
    await page.goto('/login');

    // Check for username/email field
    const usernameField = page.getByLabel(/username|email/i).or(page.getByPlaceholder(/username|email/i));
    await expect(usernameField).toBeVisible();

    // Check for password field
    const passwordField = page.getByLabel(/password/i).or(page.getByPlaceholder(/password/i));
    await expect(passwordField).toBeVisible();

    // Check for submit button
    const submitButton = page.getByRole('button', { name: /login|sign in|submit/i });
    await expect(submitButton).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill in invalid credentials
    const usernameField = page.getByLabel(/username|email/i).or(page.getByPlaceholder(/username|email/i));
    const passwordField = page.getByLabel(/password/i).or(page.getByPlaceholder(/password/i));

    await usernameField.fill('invaliduser');
    await passwordField.fill('wrongpassword');

    // Submit form
    const submitButton = page.getByRole('button', { name: /login|sign in|submit/i });
    await submitButton.click();

    // Should show error message
    await expect(page.getByText(/invalid|error|incorrect|failed/i)).toBeVisible({ timeout: 10000 });
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.goto('/login');

    // Fill in valid credentials (using test user)
    const usernameField = page.getByLabel(/username|email/i).or(page.getByPlaceholder(/username|email/i));
    const passwordField = page.getByLabel(/password/i).or(page.getByPlaceholder(/password/i));

    await usernameField.fill('testuser');
    await passwordField.fill('TestPassword123!');

    // Submit form
    const submitButton = page.getByRole('button', { name: /login|sign in|submit/i });
    await submitButton.click();

    // Should redirect away from login (to dashboard or scheduler)
    await expect(page).not.toHaveURL(/login/, { timeout: 10000 });
  });
});
