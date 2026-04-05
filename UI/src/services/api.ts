import type { CreateMockPayload, MockResponse, CloneMockRequest, MoveMockRequest } from '../types/mock'
import { API_URL } from '../config'
import { request } from './http'

// Single client for everything under `/api/mocks`. Previously the
// per-mock CRUD was split between this object (create/update/republish)
// and a sibling `mockService.ts` (delete/clone/move/fetch/existence
// checks) — same resource, two clients, slightly different error
// surfaces. They've now been collapsed into one named export so the
// rest of the app has exactly one place to look for mock HTTP calls.
//
// Existence checks (`exists/by-url`, `exists/by-name`) also live here
// because they share the same `/mocks` URL space.

const BASE = `${API_URL}/mocks`

export const mockApi = {
  create(payload: CreateMockPayload): Promise<MockResponse> {
    return request<MockResponse>(BASE, {
      method: 'POST',
      body: JSON.stringify(payload),
      errorFallback: 'Failed to create mock',
    })
  },

  fetchById(id: string): Promise<MockResponse> {
    return request<MockResponse>(`${BASE}/${id}`, {
      errorFallback: 'Failed to fetch mock',
    })
  },

  update(id: string, payload: CreateMockPayload): Promise<MockResponse> {
    return request<MockResponse>(`${BASE}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      errorFallback: 'Failed to update mock',
    })
  },

  delete(id: string): Promise<void> {
    return request<void>(`${BASE}/${id}`, {
      method: 'DELETE',
      errorFallback: 'Failed to delete mock',
    })
  },

  // Republish may return either the updated MockResponse or an empty
  // body (204) depending on backend version — callers should not depend
  // on the returned value. The shared `request<T>` helper resolves to
  // `undefined` for empty/204 bodies so we don't trip over JSON parsing.
  republish(id: string): Promise<MockResponse | undefined> {
    return request<MockResponse | undefined>(`${BASE}/${id}/republish`, {
      method: 'POST',
      errorFallback: 'Failed to republish mock',
    })
  },

  clone(id: string, payload: CloneMockRequest): Promise<MockResponse> {
    return request<MockResponse>(`${BASE}/${id}/clone`, {
      method: 'POST',
      body: JSON.stringify(payload),
      errorFallback: 'Failed to clone mock',
    })
  },

  move(id: string, payload: MoveMockRequest): Promise<MockResponse> {
    return request<MockResponse>(`${BASE}/${id}/move`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      errorFallback: 'Failed to move mock',
    })
  },

  async existsByUrl(projectId: string, url: string): Promise<boolean> {
    const result = await request<boolean>(
      `${BASE}/projects/${encodeURIComponent(projectId)}/exists/by-url?url=${encodeURIComponent(url)}`,
      {
        errorFallback: 'Failed to check whether the mock URL exists',
      },
    )
    return result === true
  },

  async existsByName(projectId: string, name: string): Promise<boolean> {
    const result = await request<boolean>(
      `${BASE}/projects/${encodeURIComponent(projectId)}/exists/by-name?name=${encodeURIComponent(name)}`,
      {
        errorFallback: 'Failed to check whether the mock name exists',
      },
    )
    return result === true
  },
}
