/**
 * Playwright `page.route()` helpers.
 *
 * The UI talks to two backends:
 *   - WireMate Spring Boot API at /api/** (proxied by Vite to :8081 in dev)
 *   - WireMock admin at http://localhost:8080/__admin/** (configured via env)
 *
 * In E2E we don't want either backend to actually be reachable; we
 * intercept every relevant URL and serve the response we want.
 *
 * Each helper returns void; tests stack them in `test.beforeEach`:
 *
 *   await mockProjectsList(page, [projectFactory({ name: 'Alpha' })])
 *   await mockWireMockHealth(page)
 *
 * Routes are registered with a glob so the in-app `API_BASE_URL` and
 * WireMock admin URL can use any host the dev server is configured for.
 */

import type { Page } from '@playwright/test'
import type { Project } from '../../src/types/project'

const json = (body: unknown, status = 200) =>
  ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }) as const

/** Intercept GET /api/projects and serve the supplied list. */
export async function mockProjectsList(page: Page, projects: Project[]): Promise<void> {
  await page.route('**/api/projects', async (route, req) => {
    if (req.method() !== 'GET') return route.fallback()
    await route.fulfill(json(projects))
  })
}

/** Intercept POST /api/projects — captures the body, returns the new project. */
export async function mockCreateProject(
  page: Page,
  build: (name: string) => Project,
): Promise<void> {
  await page.route('**/api/projects', async (route, req) => {
    if (req.method() !== 'POST') return route.fallback()
    const body = JSON.parse(req.postData() || '{}')
    await route.fulfill(json(build(body.name), 201))
  })
}

/** Intercept GET /api/projects/:id and serve the supplied project. */
export async function mockProjectDetail(
  page: Page,
  project: Project,
): Promise<void> {
  await page.route(`**/api/projects/${project.id}`, async (route, req) => {
    if (req.method() !== 'GET') return route.fallback()
    await route.fulfill(json(project))
  })
}

/** Intercept DELETE /api/projects/:id and serve 204. */
export async function mockDeleteProject(page: Page, id: string): Promise<void> {
  await page.route(`**/api/projects/${id}`, async (route, req) => {
    if (req.method() !== 'DELETE') return route.fallback()
    await route.fulfill({ status: 204, body: '' })
  })
}

/** Stub the WireMock admin health endpoint so the sidebar indicator settles. */
export async function mockWireMockHealth(page: Page, healthy = true): Promise<void> {
  await page.route('**/__admin/health', async (route) => {
    await route.fulfill(
      json({
        status: healthy ? 'healthy' : 'unhealthy',
        message: '',
        version: '3.0.0',
        uptimeInSeconds: 1,
        timestamp: new Date().toISOString(),
      }),
    )
  })
  await page.route('**/__admin/version', async (route) => {
    await route.fulfill(json({ version: '3.0.0' }))
  })
}

/**
 * Catch-all: route every other /api/** and /__admin/** to an empty 200
 * so a test only stubs what it cares about. Call last in beforeEach.
 *
 * Implementation note: Playwright runs page-level routes LIFO — the
 * most-recently-registered handler wins. A naive `page.route()`
 * catch-all therefore shadows every specific handler that was set up
 * earlier in the same `beforeEach`. We register against the
 * *browser context* instead, which Playwright consults only after no
 * page-level handler matched — i.e. exactly the "fallback to empty
 * 200" semantics this helper promises.
 */
export async function passthroughEmpty(page: Page): Promise<void> {
  await page.context().route('**/api/**', async (route) => {
    await route.fulfill(json({}, 200))
  })
  await page.context().route('**/__admin/**', async (route) => {
    await route.fulfill(json({}, 200))
  })
}

/**
 * Intercept GET /__admin/mappings — serve a stub mapping list.
 * The shape mirrors what WireMock actually returns.
 */
export async function mockWireMockMappingsList(
  page: Page,
  mappings: unknown[],
): Promise<void> {
  await page.route('**/__admin/mappings*', async (route, req) => {
    if (req.method() !== 'GET') return route.fallback()
    await route.fulfill(json({ mappings, meta: { total: mappings.length } }))
  })
}

/**
 * Intercept DELETE /__admin/mappings — return 200 + count how many
 * times the endpoint is hit so journeys can assert one-shot deletion.
 * The counter is captured on the returned object so the test can read
 * it after acting on the UI.
 */
export async function mockWireMockDeleteAllMappings(
  page: Page,
): Promise<{ readonly hits: () => number }> {
  let count = 0
  await page.route('**/__admin/mappings*', async (route, req) => {
    if (req.method() !== 'DELETE') return route.fallback()
    count++
    await route.fulfill({ status: 200, body: '' })
  })
  return { hits: () => count }
}

/**
 * Intercept GET /__admin/settings — serve the supplied settings shape.
 * Defaults to an empty object so the form renders with `delayEnabled = false`.
 */
export async function mockWireMockSettingsGet(
  page: Page,
  settings: Record<string, unknown> = {},
): Promise<void> {
  await page.route('**/__admin/settings*', async (route, req) => {
    if (req.method() !== 'GET') return route.fallback()
    await route.fulfill(json(settings))
  })
}

/**
 * Intercept POST /__admin/settings — capture every body the UI sends so
 * the test can assert the save payload shape. The returned `bodies`
 * accessor returns parsed JSON bodies in submission order.
 */
export async function mockWireMockSettingsPost(
  page: Page,
): Promise<{ readonly bodies: () => unknown[] }> {
  const recorded: unknown[] = []
  await page.route('**/__admin/settings*', async (route, req) => {
    if (req.method() !== 'POST') return route.fallback()
    try {
      recorded.push(JSON.parse(req.postData() || '{}'))
    } catch {
      recorded.push(req.postData() ?? '')
    }
    await route.fulfill({ status: 200, body: '' })
  })
  return { bodies: () => recorded }
}

/**
 * Intercept DELETE /__admin/requests — capture the hit count so a Clear
 * Journal journey can assert one-shot deletion.
 */
export async function mockWireMockDeleteAllRequests(
  page: Page,
): Promise<{ readonly hits: () => number }> {
  let count = 0
  await page.route('**/__admin/requests*', async (route, req) => {
    if (req.method() !== 'DELETE') return route.fallback()
    count++
    await route.fulfill({ status: 200, body: '' })
  })
  return { hits: () => count }
}

/**
 * Default 200 + empty list for GET /__admin/requests so the journal
 * status probe doesn't time out / mislabel the journal as unknown.
 */
export async function mockWireMockRequestsListEmpty(
  page: Page,
): Promise<void> {
  await page.route('**/__admin/requests*', async (route, req) => {
    if (req.method() !== 'GET') return route.fallback()
    await route.fulfill(json({
      requests: [],
      meta: { total: 0 },
      requestJournalDisabled: false,
    }))
  })
}
