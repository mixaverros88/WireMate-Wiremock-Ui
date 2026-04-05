/**
 * Page Object Model for the /stubs view.
 *
 * Role-first selectors. The page header has two buttons we care about
 * — Refresh and Delete All — both targeted by accessible name.
 */

import type { Locator, Page } from '@playwright/test'

export class StubsPage {
  readonly page: Page
  readonly searchInput: Locator
  readonly refreshButton: Locator
  readonly deleteAllButton: Locator

  constructor(page: Page) {
    this.page = page
    this.searchInput = page.getByPlaceholder('Search by URL or method...')
    this.refreshButton = page.getByRole('button', { name: 'Refresh' })
    // Match the button by its visible label.
    this.deleteAllButton = page.getByRole('button', { name: /Delete All/ })
  }

  async goto(): Promise<void> {
    await this.page.goto('/stubs')
  }

  /** Confirm-modal "Yes, delete all" button, mounted via <Teleport>. */
  confirmDeleteAllButton(): Locator {
    return this.page.getByRole('button', { name: 'Yes, delete all' })
  }

  /** Counter chip text — e.g. "5 of 7 stubs". */
  countChip(): Locator {
    return this.page.getByText(/\d+\s*of\s*\d+\s*stubs/)
  }
}
