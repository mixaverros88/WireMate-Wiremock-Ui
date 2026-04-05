/**
 * Thin compatibility shim for older call sites.
 *
 * Historically the project had TWO clients for `/api/mocks`:
 *   • `mockApi` in `./api.ts` (create / update / republish)
 *   • these loose functions (delete / clone / move / fetch / existence)
 *
 * Same resource, two slightly-different error surfaces. Everything is
 * now consolidated into `mockApi` (see ./api.ts). This file re-exports
 * the legacy free-function names so existing imports keep compiling
 * while the codebase is migrated.
 *
 * Prefer importing `mockApi` directly in new code. New methods should
 * be added there, not here.
 */

import type { MockResponse, CloneMockRequest, MoveMockRequest } from '../types/mock'
import { mockApi } from './api'

export function checkMockUrlExists(projectId: string, url: string): Promise<boolean> {
  return mockApi.existsByUrl(projectId, url)
}

export function checkMockNameExists(projectId: string, name: string): Promise<boolean> {
  return mockApi.existsByName(projectId, name)
}

export function deleteMock(id: string): Promise<void> {
  return mockApi.delete(id)
}

export function cloneMock(mockId: string, request: CloneMockRequest): Promise<MockResponse> {
  return mockApi.clone(mockId, request)
}

export function moveMock(mockId: string, request: MoveMockRequest): Promise<MockResponse> {
  return mockApi.move(mockId, request)
}

export async function fetchMockById(mockId: string): Promise<MockResponse> {
  try {
    return await mockApi.fetchById(mockId)
  } catch (e) {
    // Preserve the legacy "Mock <id> not found" message so callers
    // (notably MockRedirectView) can still string-match on it to
    // distinguish 404 from network failures.
    const message = e instanceof Error ? e.message : String(e)
    if (/not\s+found/i.test(message)) {
      throw new Error(`Mock ${mockId} not found`)
    }
    throw e
  }
}
