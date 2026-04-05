/**
 * Page Object Model for the /settings view.
 *
 * After the Global Response Delay / Request Journal removal the page
 * only exposes Server Health and the Danger Zone. The POM keeps the
 * shared bits (navigation, Refresh) — controls for the removed
 * sections live nowhere in the DOM any more.
 */

import type { Locator, Page } from '@playwright/test'

export class SettingsPage {
  readonly page: Page
  readonly refreshButton: Locator

  constructor(page: Page) {
    this.page = page
    this.refreshButton = page.getByRole('button', { name: 'Refresh' })
  }

  async goto(): Promise<void> {
    await this.page.goto('/settings')
  }
}
