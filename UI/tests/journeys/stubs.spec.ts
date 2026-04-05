/**
 * E2E journeys for the WireMock Stubs viewer.
 *
 * The page talks directly to WireMock's admin port (no WireMate backend
 * involved). We intercept `/__admin/mappings` for the list and the
 * destructive Delete All call, and assert the UI's contract:
 *
 *   - the page calls `GET /__admin/mappings` exactly once on mount
 *     (no server-side pagination, no `limit`/`offset` query string)
 *   - the result-count chip reflects the loaded list
 *   - Delete All is disabled when the list is empty
 *   - Delete All fires `DELETE /__admin/mappings` once after confirmation
 *     and clears the on-screen list
 */

import { expect, test } from '@playwright/test'
import {
  mockWireMockDeleteAllMappings,
  mockWireMockHealth,
  mockWireMockMappingsList,
  passthroughEmpty,
} from '../fixtures/routeMocks'
import { StubsPage } from '../poms/StubsPage'

function stubFixture(id: string, url = '/api/x', method = 'GET') {
  return {
    id,
    name: id,
    request: { method, url },
    response: { status: 200 },
    persistent: true,
    metadata: {},
  }
}

test.beforeEach(async ({ page }) => {
  await mockWireMockHealth(page)
})

test.describe('Stubs viewer — load + counter', () => {
  test('renders one card per mapping the admin endpoint returns', async ({ page }) => {
    await mockWireMockMappingsList(page, [
      stubFixture('s1', '/api/users'),
      stubFixture('s2', '/api/orders'),
      stubFixture('s3', '/api/payments'),
    ])
    await passthroughEmpty(page)

    const stubs = new StubsPage(page)
    await stubs.goto()

    await expect(stubs.countChip()).toContainText('3 of 3 stubs')
    // Each MOCK URL renders in its own card.
    await expect(page.getByText('/api/users')).toBeVisible()
    await expect(page.getByText('/api/orders')).toBeVisible()
    await expect(page.getByText('/api/payments')).toBeVisible()
  })
})

test.describe('Stubs viewer — Delete All', () => {
  test('Delete All is disabled when the list is empty', async ({ page }) => {
    await mockWireMockMappingsList(page, [])
    await passthroughEmpty(page)

    const stubs = new StubsPage(page)
    await stubs.goto()

    await expect(stubs.deleteAllButton).toBeDisabled()
  })

  test('Delete All opens a confirm modal, fires DELETE /__admin/mappings, and clears the list', async ({ page }) => {
    await mockWireMockMappingsList(page, [
      stubFixture('s1', '/api/x/1'),
      stubFixture('s2', '/api/x/2'),
    ])
    const deleteAll = await mockWireMockDeleteAllMappings(page)
    await passthroughEmpty(page)

    const stubs = new StubsPage(page)
    await stubs.goto()
    await expect(stubs.countChip()).toContainText('2 of 2 stubs')

    // Click Delete All — confirm modal appears.
    await stubs.deleteAllButton.click()
    await expect(stubs.confirmDeleteAllButton()).toBeVisible()
    // Modal copy names the endpoint + the stub count.
    await expect(page.getByText('DELETE /__admin/mappings')).toBeVisible()
    await expect(page.getByText(/wipe all 2 stubs/)).toBeVisible()

    // Confirm — exactly one DELETE call should land.
    await stubs.confirmDeleteAllButton().click()
    await expect(stubs.countChip()).toContainText('0 of 0 stubs')
    expect(deleteAll.hits()).toBe(1)
    // And the Delete All button is now disabled because the list is empty.
    await expect(stubs.deleteAllButton).toBeDisabled()
  })
})
