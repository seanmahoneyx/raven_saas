import { test as setup, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

/**
 * Interactive login: opens the app and waits for you to sign in by hand,
 * then persists the session to .auth/admin.json so the smoke tests can
 * re-use it without scraping credentials.
 *
 * Run: npx playwright test e2e/login.setup.ts --headed
 *
 * Detection: we consider login complete once the URL is no longer on
 * /login (the app redirects to a dashboard or last-visited page).
 */
const AUTH_FILE = '.auth/admin.json'

// Allow up to 6 minutes for the human to sign in. Overrides Playwright's
// 30-second default test timeout.
setup.setTimeout(6 * 60_000)

/**
 * Reuse an existing saved session if it's still good. We probe by loading
 * the app root with the stored cookies/localStorage; if the app doesn't
 * bounce us back to /login, the session is valid and we skip the
 * interactive pause entirely.
 *
 * Force a fresh login any time by deleting .auth/admin.json (or running
 * `npx playwright test --project=setup --headed --force-login` after
 * setting FORCE_LOGIN=1 in the environment).
 */
setup('authenticate', async ({ browser }) => {
  // Ensure the .auth directory exists.
  const authDir = path.dirname(AUTH_FILE)
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  const forceLogin = !!process.env.FORCE_LOGIN
  const haveSaved = fs.existsSync(AUTH_FILE)

  // Fast path: try the saved session first.
  if (haveSaved && !forceLogin) {
    const ctx = await browser.newContext({ storageState: AUTH_FILE })
    const probe = await ctx.newPage()
    await probe.goto('/')
    // Give the SPA a moment to either render or redirect to /login.
    await probe.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    if (!probe.url().includes('/login')) {
      console.log('\n  ✓ Reusing saved session — no login needed.\n')
      // Refresh storageState (some apps rotate tokens) and exit cleanly.
      await ctx.storageState({ path: AUTH_FILE })
      await ctx.close()
      return
    }
    console.log('\n  Saved session expired — falling through to interactive login.\n')
    await ctx.close()
  }

  // Slow path: prompt the human.
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/login')

  console.log('\n  ──────────────────────────────────────────')
  console.log('  Chromium + Playwright Inspector are open.')
  console.log('  1. Sign in inside the Chromium window.')
  console.log('  2. Click the green "Resume" button in the')
  console.log('     Playwright Inspector to continue.')
  console.log('  ──────────────────────────────────────────\n')

  await page.pause()

  await expect(page).not.toHaveURL(/\/login/, { timeout: 5_000 })

  await ctx.storageState({ path: AUTH_FILE })
  await ctx.close()
  console.log(`\n  Saved auth state to ${AUTH_FILE}\n`)
})
