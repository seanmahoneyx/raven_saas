import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for end-to-end smoke tests against the local dev stack.
 *
 * Prerequisite: Django on :8000 and Vite on :5173 must be running before
 * `npx playwright test` is invoked. Login state is captured by running
 * `npx playwright test e2e/login.setup.ts --headed` first, which prompts you
 * to sign in interactively and persists cookies + localStorage to
 * .auth/admin.json.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // tests mutate shared data — run serially
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    headless: false,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
      },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
  outputDir: 'test-results',
})
