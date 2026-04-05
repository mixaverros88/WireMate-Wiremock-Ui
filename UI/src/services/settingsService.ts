import type {
  HealthResponse,
  VersionResponse,
} from '../types/settings'

import { WIREMOCK_ADMIN_URL } from '../config'
import { request, requestNoBody } from './http'

// Settings & admin operations against the WireMock admin port. All
// requests run through the shared `request<T>` helper so the error
// path goes through the same ProblemDetail-aware parser as everything
// else — previously this file had its own local `request<T>` that
// emitted raw response text on failures and bypassed `errors.ts`.

const ADMIN = WIREMOCK_ADMIN_URL

/** GET /__admin/requests/unmatched/near-misses — Get near-miss analysis */
export function fetchNearMisses(): Promise<unknown> {
  return request<unknown>(`${ADMIN}/requests/unmatched/near-misses`, {
    errorFallback: 'Failed to fetch near misses',
  })
}

/** POST /__admin/reset — Reset mappings and journal */
export function resetAll(): Promise<void> {
  return requestNoBody(`${ADMIN}/reset`, {
    method: 'POST',
    errorFallback: 'Failed to reset WireMock',
  })
}

/** POST /__admin/shutdown — Shutdown the server */
export function shutdownServer(): Promise<void> {
  return requestNoBody(`${ADMIN}/shutdown`, {
    method: 'POST',
    errorFallback: 'Failed to shut down WireMock',
  })
}

/** GET /__admin/health — Health check */
export function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>(`${ADMIN}/health`, {
    errorFallback: 'Failed to fetch health',
  })
}

/** GET /__admin/version — Get version */
export function fetchVersion(): Promise<VersionResponse> {
  return request<VersionResponse>(`${ADMIN}/version`, {
    errorFallback: 'Failed to fetch version',
  })
}
