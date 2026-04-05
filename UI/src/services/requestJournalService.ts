import type {
  RequestJournalResponse,
  RequestPattern,
  LoggedRequest,
  LoggedRequestDetail,
} from '../types/requestJournal'

import { WIREMOCK_ADMIN_URL } from '../config'
import { request, requestNoBody } from './http'

// All requests go through the shared `request<T>` helper so error
// parsing is consistent with the rest of the app — previously this
// service emitted raw response text on failures, which often looked
// like an opaque HTML proxy page rather than a useful toast message.

const BASE_URL = `${WIREMOCK_ADMIN_URL}/requests`

function normalizeEntry(item: LoggedRequest | LoggedRequestDetail, index: number): LoggedRequest {
  if ((item as LoggedRequest).request) {
    const wrapped = item as LoggedRequest
    if (!wrapped.id) {
      const alt = (item as unknown as { uuid?: string }).uuid
      if (typeof alt === 'string' && alt) {
        return { ...wrapped, id: alt }
      }
    }
    return wrapped
  }
  const detail = item as LoggedRequestDetail & { id?: string }
  return {
    id: detail.id ?? `find-${index}-${detail.loggedDate ?? ''}`,
    request: detail,
  }
}

export interface GetAllRequestsOptions {
  /**
   * ISO-8601 timestamp passed as the `since` query param to
   * GET /__admin/requests. WireMock filters the journal server-side
   * and returns only entries with `loggedDate >= since`, which is
   * faster than loading the whole journal and trimming on the client.
   */
  since?: string
  /**
   * Optional `limit` passed as a query param to GET /__admin/requests.
   * Caps how many entries are returned in a single fetch — useful when
   * the journal is large and we want to avoid pulling tens of thousands
   * of rows into the browser.
   */
  limit?: number
}

interface RawJournalResponse {
  requests?: Array<LoggedRequest | LoggedRequestDetail>
  meta?: { total: number }
  requestJournalDisabled?: boolean
}

export async function getAllRequests(
  opts: GetAllRequestsOptions = {},
): Promise<RequestJournalResponse> {
  const params = new URLSearchParams()
  if (opts.since) params.set('since', opts.since)
  if (typeof opts.limit === 'number' && opts.limit > 0) {
    params.set('limit', String(opts.limit))
  }
  const url = params.toString() ? `${BASE_URL}?${params.toString()}` : BASE_URL

  const raw = await request<RawJournalResponse>(url, {
    errorFallback: 'Failed to fetch request journal',
  })
  const normalized: LoggedRequest[] = (raw.requests ?? []).map(normalizeEntry)
  return {
    requests: normalized,
    meta: raw.meta ?? { total: normalized.length },
    requestJournalDisabled: raw.requestJournalDisabled ?? false,
  }
}

export function deleteAllRequests(): Promise<void> {
  return requestNoBody(BASE_URL, {
    method: 'DELETE',
    errorFallback: 'Failed to delete all requests',
  })
}

export function deleteRequest(id: string): Promise<void> {
  return requestNoBody(`${BASE_URL}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    errorFallback: 'Failed to delete request',
  })
}

export async function removeRequestsByPattern(
  pattern: RequestPattern,
): Promise<{ requestsRemoved?: LoggedRequest[]; ids: string[] }> {
  const raw = await request<{
    requestsRemoved?: LoggedRequest[]
    ids?: string[]
  }>(`${BASE_URL}/remove`, {
    method: 'POST',
    body: JSON.stringify(pattern),
    errorFallback: 'Failed to remove requests',
  })
  return {
    requestsRemoved: raw.requestsRemoved,
    ids: raw.ids ?? (raw.requestsRemoved ?? []).map(r => r.id).filter(Boolean) as string[],
  }
}
