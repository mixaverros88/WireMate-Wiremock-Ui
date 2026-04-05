/**
 * Page Object Model for /create-project.
 */

import type { Locator, Page } from '@playwright/test'

export class CreateProjectPage {
  readonly page: Page
  readonly nameInput: Locator
  readonly submitButton: Locator

  constructor(page: Page) {
    this.page = page
    this.nameInput = page.getByLabel('Project Name')
    this.submitButton = page.getByRole('button', { name: /Create Project/ })
  }

  async goto(): Promise<void> {
    await this.page.goto('/create-project')
  }

  async fillAndSubmit(name: string): Promise<void> {
    await this.nameInput.fill(name)
    await this.submitButton.click()
  }
}
