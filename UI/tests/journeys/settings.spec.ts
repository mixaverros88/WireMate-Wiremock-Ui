/**
 * E2E journeys for the Settings page.
 *
 * The Global Response Delay and Request Journal panels were removed;
 * the page now just exposes Server Health and the Danger Zone. These
 * journeys pin what's left so a regression that re-introduces the
 * removed controls (or breaks the Refresh / Reset chains) is caught.
 *
 * Health + version come from `/__admin/*`; we intercept both so no
 * real WireMock is required.
 */

import { expect, test } from '@playwright/test'
import {
  mockWireMockHealth,
  passthroughEmpty,
} from '../fixtures/routeMocks'
import { SettingsPage } from '../poms/SettingsPage'

test.beforeEach(async ({ page }) => {
  await mockWireMockHealth(page)
})

test.describe('Settings — surfaces only Health + Danger Zone', () => {
  test('renders Server Health populated from the admin endpoint', async ({ page }) => {
    await passthroughEmpty(page)
    const settings = new SettingsPage(page)
    await settings.goto()

    await expect(page.getByRole('heading', { name: 'Server Health' })).toBeVisible()
    // "healthy" is the live status pill, "3.0.0" comes from the mocked health.
    await expect(page.getByText(/healthy/i).first()).toBeVisible()
    await expect(page.getByText('3.0.0').first()).toBeVisible()
  })

  test('does NOT render the removed Global Response Delay or Request Journal sections', async ({ page }) => {
    await passthroughEmpty(page)
    const settings = new SettingsPage(page)
    await settings.goto()

    // Both removed panels had their own <h2> heading, so the absence
    // check anchors on role=heading rather than `getByText` (the
    // Reset All description copy still mentions "request journal" in
    // running prose, which would otherwise false-positive).
    await expect(page.getByRole('heading', { name: 'Global Response Delay' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Request Journal' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save Settings' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Clear Journal/ })).toHaveCount(0)
  })

  test('Danger Zone is still present with Reset All and Shutdown Server', async ({ page }) => {
    await passthroughEmpty(page)
    const settings = new SettingsPage(page)
    await settings.goto()

    await expect(page.getByRole('heading', { name: 'Danger Zone' })).toBeVisible()
    // Each row in the Danger Zone surface has both a heading-style
    // label and a button — use the button (role-based) to keep the
    // locator strict.
    await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Shutdown' })).toBeVisible()
  })
})
