/**
 * Page Object Model for the /projects list view.
 *
 * Selectors are role-first, with `aria-label` falling back to visible text.
 * No CSS classes, no nth-child — the layer above shouldn't care that the
 * cards are `<div>` vs `<article>`.
 */

import type { Locator, Page } from '@playwright/test'

export class ProjectsPage {
  readonly page: Page
  readonly searchInput: Locator
  readonly emptyHeading: Locator
  readonly errorAlert: Locator

  constructor(page: Page) {
    this.page = page
    this.searchInput = page.getByPlaceholder('Search projects...')
    this.emptyHeading = page.getByRole('heading', { name: 'No projects yet' })
    // BaseToast also uses `role="alert"`, so resolving the page-level
    // error state by role alone matches two elements (inline error +
    // toast). Anchor on the inline alert's heading text so the locator
    // refers to a single element.
    this.errorAlert = page.getByRole('alert').filter({
      has: page.getByRole('heading', { name: "Couldn't load projects" }),
    })
  }

  async goto(): Promise<void> {
    await this.page.goto('/projects')
  }

  /** All visible project cards (one per `Project` returned by the API). */
  cards(): Locator {
    // Each card has a heading element with the project name; query those.
    return this.page.locator('div.rounded-xl').filter({ has: this.page.locator('h3') })
  }

  /** The "View" button on a card whose heading matches `name`. */
  viewButton(name: string): Locator {
    return this.page.getByRole('button', { name: `View ${name}` })
  }

  /** The "Delete" button on a card whose heading matches `name`. */
  deleteButton(name: string): Locator {
    return this.page.getByRole('button', { name: `Delete ${name}` })
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query)
  }
}
