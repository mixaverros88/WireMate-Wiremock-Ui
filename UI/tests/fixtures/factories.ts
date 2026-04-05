/**
 * Test data factories.
 *
 * Pattern: each factory takes a partial override and returns a fully
 * populated domain object. Centralized so each test reads a sentence's
 * worth of overrides instead of a 30-line JSON literal, and so backend
 * shape changes only need updating in one place.
 *
 * Used by both Playwright `page.route()` interceptors and (where useful)
 * unit specs.
 */

import type { Project } from '../../src/types/project'
import type { MockResponse } from '../../src/types/mock'

let _id = 0
function nextId(prefix: string): string {
  return `${prefix}-${++_id}`
}

export function projectFactory(overrides: Partial<Project> = {}): Project {
  return {
    id: overrides.id ?? nextId('proj'),
    name: 'Test Project',
    mocks: [],
    createdAt: '2026-05-14T10:00:00Z',
    updatedAt: '2026-05-14T10:00:00Z',
    ...overrides,
  }
}

export function mockFactory(overrides: Partial<MockResponse> = {}): MockResponse {
  return {
    id: overrides.id ?? nextId('mock'),
    name: 'Sample Mock',
    projectId: 'proj-1',
    persistent: true,
    request: { method: 'GET', url: '/api/sample' },
    response: { status: 200, body: '{}' },
    createdAt: '2026-05-14T10:00:00Z',
    updatedAt: '2026-05-14T10:00:00Z',
    ...overrides,
  }
}
