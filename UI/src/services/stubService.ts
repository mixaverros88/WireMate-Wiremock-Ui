/**
 * WireMock Stub Service — talks to the WireMock admin API at `/__admin/mappings`.
 *
 * All requests go through the shared `request<T>` helper from ./http
 * so error parsing is consistent across the app. `checkStubExists`
 * keeps its bespoke 200/404/5xx retry logic because the semantics are
 * specific: a 404 is a normal answer (the stub doesn't exist),
 * everything else is "couldn't tell".
 */

import { WIREMOCK_ADMIN_URL } from '../config'
import { request, requestNoBody } from './http'

export interface RequestConfig {
  method?: string
  url?: string
  urlPath?: string
  urlPattern?: string
  urlPathPattern?: string
  headers?: Record<string, string>
  queryParameters?: Record<string, unknown>
  body?: string | Record<string, unknown>
}

export interface ResponseConfig {
  status?: number
  headers?: Record<string, string>
  body?: string
  jsonBody?: Record<string, unknown>
  fixedDelayMilliseconds?: number
}

export interface StubMapping {
  id: string
  name?: string
  request: RequestConfig
  response: ResponseConfig
  persistent?: boolean
  priority?: number
  createdDate?: string
  metadata?: Record<string, unknown>
}

export interface StubMappingsResponse {
  mappings: StubMapping[]
  meta?: {
    total: number
  }
}

export interface DeleteStubResponse {
  success: boolean
  message?: string
}

const BASE = `${WIREMOCK_ADMIN_URL}/mappings`

/**
 * Fetch stub mappings from WireMock admin API with optional pagination.
 * Supports: limit (page size) and offset (skip N items).
 */
export function fetchAllStubs(params?: {
  limit?: number
  offset?: number
}): Promise<StubMappingsResponse> {
  const query = new URLSearchParams()
  if (params?.limit) query.set('limit', String(params.limit))
  if (params?.offset !== undefined) query.set('offset', String(params.offset))
  const qs = query.toString()
  return request<StubMappingsResponse>(`${BASE}${qs ? `?${qs}` : ''}`, {
    errorFallback: 'Failed to fetch stubs',
  })
}

/** Delete a stub mapping by ID */
export async function deleteStub(id: string): Promise<DeleteStubResponse> {
  await request<void>(`${BASE}/${id}`, {
    method: 'DELETE',
    errorFallback: 'Failed to delete stub',
  })
  return { success: true, message: `Stub ${id} deleted successfully` }
}

/**
 * Delete every stub on the WireMock server in a single admin call.
 * Hits `DELETE /__admin/mappings`, which clears all mappings (both
 * persistent and ephemeral) and is irreversible from the WireMock side.
 */
export function deleteAllStubs(): Promise<void> {
  return requestNoBody(`${BASE}`, {
    method: 'DELETE',
    errorFallback: 'Failed to delete all stubs',
  })
}

/** Get a single stub mapping by ID */
export function getStub(id: string): Promise<StubMapping> {
  return request<StubMapping>(`${BASE}/${id}`, {
    errorFallback: 'Failed to fetch stub',
  })
}

/**
 * Check whether a stub mapping with the given ID currently exists in
 * WireMock. Returns `true` for 200, `false` for 404, and throws for any
 * other status so callers can distinguish "definitely missing" from
 * "network/admin-port problem" (which should not be rendered as missing).
 *
 * We retry on transient 5xx / network errors because WireMock's embedded
 * Jetty on the admin port returns 503 (Service Unavailable) under
 * concurrent load — when this page fires several probes at once, a
 * subset routinely comes back 503 even though the mapping resolves
 * fine on a follow-up request. Without retrying we would mislabel
 * existing stubs as missing the moment the user opens a busy project.
 *
 * NOTE: this function bypasses the shared `request<T>` helper because
 * its 404 case is a NORMAL answer (the stub legitimately doesn't
 * exist), not an error to be turned into a thrown Error. The shared
 * helper has no opinion about which status codes are "success"
 * other than `response.ok`.
 */
export async function checkStubExists(id: string): Promise<boolean> {
  const maxAttempts = 3
  let lastNetworkError: unknown = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // The fetch call and the response inspection are intentionally
    // separated. We only want to retry on TRANSIENT failures (network
    // error or 5xx), not on a hard 4xx — wrapping the whole loop body
    // in one try/catch used to fold "Unexpected status 401" thrown
    // below into the retry path and obscure the original status.
    let response: Response
    try {
      response = await fetch(`${BASE}/${id}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      // Network blip — retry with a short linear backoff, propagate
      // on the last attempt.
      lastNetworkError = e
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 150 * attempt))
        continue
      }
      throw e
    }
    if (response.status === 200) return true
    if (response.status === 404) return false
    // 5xx is typically transient under admin-port contention — retry
    // with a short linear backoff before giving up. 4xx other than
    // 404 is a hard error (bad UUID, etc.) and should NOT be retried.
    if (response.status >= 500 && response.status < 600 && attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, 150 * attempt))
      continue
    }
    throw new Error(`Unexpected status ${response.status} when checking stub existence`)
  }
  throw lastNetworkError ?? new Error('checkStubExists: exhausted retries')
}
