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
