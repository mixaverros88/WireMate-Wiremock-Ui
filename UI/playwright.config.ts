import { defineConfig, devices } from '@playwright/test'

// Playwright config.
//
// Test layout:
//   tests/journeys/*.spec.ts   → real user journeys (gated on the dev server)
//   tests/poms/*.ts            → page objects, NOT spec files
//   tests/fixtures/*.ts        → factories + page.route() helpers
//
// The dev server is auto-started on demand. We can't run E2E without it
// because the SPA is served by Vite. Backend calls are intercepted via
// `page.route()` (see tests/fixtures/routeMocks.ts), so no real
// Spring Boot + WireMock instance is required.
//
// Retries: 1 in CI to absorb the rare flaky environment, 0 locally so
// flakes can't hide. Workers stay at 1 (the test suite is small and
// the dev server is single-instance anyway).

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './tests',
  // Only consider `journeys/*.spec.ts` as tests. POMs and fixtures live
  // alongside but are imported, not executed.
  testMatch: /journeys\/.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    // Trace only on retry locally; record one on failure in CI so the
    // artifact uploader can attach it to the run.
    trace: isCI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
})
