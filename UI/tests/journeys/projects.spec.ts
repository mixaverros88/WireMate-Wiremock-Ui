/**
 * E2E journeys for project list management.
 *
 * Backend is fully mocked via `page.route()` — no real Spring Boot or
 * WireMock instance required. Each journey is independent and idempotent.
 *
 * Driven through the UI as a user would: no reaching into Vue
 * internals, no `__vue_app__` poking. Selectors come from the POMs.
 */

import { expect, test } from '@playwright/test'
import { projectFactory } from '../fixtures/factories'
import {
  mockCreateProject,
  mockProjectsList,
  mockWireMockHealth,
  passthroughEmpty,
} from '../fixtures/routeMocks'
import { ProjectsPage } from '../poms/ProjectsPage'
import { CreateProjectPage } from '../poms/CreateProjectPage'

test.beforeEach(async ({ page }) => {
  // Always settle the sidebar health indicator so it doesn't bleed
  // unhealthy states into other assertions.
  await mockWireMockHealth(page)
})

test.describe('Projects list', () => {
  test('shows the empty state when the API returns no projects', async ({ page }) => {
    await mockProjectsList(page, [])
    await passthroughEmpty(page)

    const projects = new ProjectsPage(page)
    await projects.goto()
    await expect(projects.emptyHeading).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create Project' })).toBeVisible()
  })

  test('renders one card per project returned by the API', async ({ page }) => {
    await mockProjectsList(page, [
      projectFactory({ id: 'p1', name: 'Alpha' }),
      projectFactory({ id: 'p2', name: 'Beta' }),
      projectFactory({ id: 'p3', name: 'Gamma' }),
    ])
    await passthroughEmpty(page)

    const projects = new ProjectsPage(page)
    await projects.goto()
    await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Beta' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Gamma' })).toBeVisible()
  })

  test('filters the visible list as the user types in the search box', async ({ page }) => {
    await mockProjectsList(page, [
      projectFactory({ name: 'Payments' }),
      projectFactory({ name: 'Shipping' }),
    ])
    await passthroughEmpty(page)

    const projects = new ProjectsPage(page)
    await projects.goto()
    await projects.search('pay')
    await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Shipping' })).toBeHidden()
  })

  test('shows the error alert with a Retry button when the API fails', async ({ page }) => {
    // 500 from the projects endpoint; passthroughEmpty must not catch it.
    await page.route('**/api/projects', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Database is down' }),
      })
    })
    await passthroughEmpty(page)

    const projects = new ProjectsPage(page)
    await projects.goto()
    await expect(projects.errorAlert).toBeVisible()
    await expect(page.getByRole('heading', { name: "Couldn't load projects" })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  })
})

test.describe('Create project journey', () => {
  test('user creates a new project from the list view', async ({ page }) => {
    let creates = 0
    await mockProjectsList(page, [])
    await mockCreateProject(page, (name) => {
      creates++
      return projectFactory({ id: 'created-1', name })
    })
    await passthroughEmpty(page)

    // Start on the empty list, click into the create flow, type a name, submit.
    const projects = new ProjectsPage(page)
    await projects.goto()
    await expect(projects.emptyHeading).toBeVisible()
    await page.getByRole('button', { name: 'Create Project' }).click()

    const createPage = new CreateProjectPage(page)
    await expect(createPage.nameInput).toBeVisible()
    await createPage.fillAndSubmit('My new project')

    // Successful create routes back to /projects.
    await expect(page).toHaveURL(/\/projects$/)
    expect(creates).toBe(1)
  })

  test('surfaces the backend duplicate-name error in the toast', async ({ page }) => {
    await mockProjectsList(page, [])
    await page.route('**/api/projects', async (route, req) => {
      if (req.method() !== 'POST') return route.fallback()
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Project with name X already exists' }),
      })
    })
    await passthroughEmpty(page)

    const projects = new ProjectsPage(page)
    await projects.goto()
    await page.getByRole('button', { name: 'Create Project' }).click()

    const createPage = new CreateProjectPage(page)
    await createPage.fillAndSubmit('X')

    // The toast renders the backend's `detail` text.
    await expect(page.getByText('Project with name X already exists')).toBeVisible()
    // We stayed on /create-project — no router push happens on failure.
    await expect(page).toHaveURL(/\/create-project$/)
  })

  test('rejects an empty name with the validation error and no API call', async ({ page }) => {
    let creates = 0
    await mockProjectsList(page, [])
    await page.route('**/api/projects', async (route, req) => {
      if (req.method() === 'POST') {
        creates++
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await passthroughEmpty(page)

    const createPage = new CreateProjectPage(page)
    await createPage.goto()
    await createPage.submitButton.click()

    // No POST was made.
    expect(creates).toBe(0)
    // Inline validation message is visible.
    await expect(page.getByText('Project name is required')).toBeVisible()
  })
})
