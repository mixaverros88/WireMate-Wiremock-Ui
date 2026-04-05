/**
 * Tests for requestJournalService.
 *
 * Two surfaces matter: URL composition (the WireMock admin endpoint
 * shape with the optional `since` and `limit` query params) and the
 * `normalizeEntry` shape mapping (the journal endpoint can return
 * either pre-wrapped `LoggedRequest` entries or bare `LoggedRequestDetail`
 * objects, depending on whether the caller went through /requests or
 * /requests/find).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteAllRequests,
  deleteRequest,
  getAllRequests,
  removeRequestsByPattern,
} from './requestJournalService'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function lastUrl(): string {
  return (fetch as any).mock.calls[(fetch as any).mock.calls.length - 1][0]
}
function lastInit(): RequestInit {
  return (fetch as any).mock.calls[(fetch as any).mock.calls.length - 1][1] ?? {}
}

describe('getAllRequests', () => {
  it('hits GET /__admin/requests with no query when no options supplied', async () => {
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({ requests: [], meta: { total: 0 } }))
    await getAllRequests()
    expect(lastUrl()).toMatch(/\/__admin\/requests$/)
  })

  it('passes `since` as a query param', async () => {
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({ requests: [] }))
    await getAllRequests({ since: '2026-05-14T10:00:00Z' })
    expect(lastUrl()).toContain('since=2026-05-14T10%3A00%3A00Z')
  })

  it('passes `limit` as a query param when positive', async () => {
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({ requests: [] }))
    await getAllRequests({ limit: 1 })
    expect(lastUrl()).toContain('limit=1')
  })

  it('omits `limit` when zero or negative', async () => {
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({ requests: [] }))
    await getAllRequests({ limit: 0 })
    expect(lastUrl()).not.toContain('limit=')
  })

  it('returns the requestJournalDisabled flag', async () => {
    ;(fetch as any).mockResolvedValueOnce(
      jsonResponse({ requests: [], requestJournalDisabled: true }),
    )
    const result = await getAllRequests()
    expect(result.requestJournalDisabled).toBe(true)
  })

  it('defaults requestJournalDisabled to false when omitted', async () => {
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({ requests: [] }))
    const result = await getAllRequests()
    expect(result.requestJournalDisabled).toBe(false)
  })

  it('defaults meta.total to the length of returned entries', async () => {
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({
      requests: [
        { id: 'a', request: { url: '/x', method: 'GET' } },
        { id: 'b', request: { url: '/y', method: 'POST' } },
      ],
    }))
    const result = await getAllRequests()
    expect(result.meta.total).toBe(2)
  })

  it('synthesizes a stable id when an entry comes back without one (find path)', async () => {
    // /requests/find can return bare LoggedRequestDetail objects without
    // the wrapper. normalizeEntry should wrap them and invent an id.
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({
      requests: [
        { url: '/no-id', method: 'GET', loggedDate: '2026-05-14T10:00:00Z' },
      ],
    }))
    const result = await getAllRequests()
    expect(result.requests).toHaveLength(1)
    expect(result.requests[0].id).toMatch(/^find-0-/)
    expect(result.requests[0].request.url).toBe('/no-id')
  })

  it('lifts a `uuid` alias onto `id` when the wrapped entry lacks one', async () => {
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({
      requests: [
        { uuid: 'abc-123', request: { url: '/x', method: 'GET' } },
      ],
    }))
    const result = await getAllRequests()
    expect(result.requests[0].id).toBe('abc-123')
  })

  it('surfaces backend error messages through the shared helper', async () => {
    ;(fetch as any).mockResolvedValueOnce(
      jsonResponse({ detail: 'Journal disabled' }, { status: 503 }),
    )
    await expect(getAllRequests()).rejects.toThrow('Journal disabled')
  })
})

describe('deleteAllRequests / deleteRequest', () => {
  it('DELETEs /__admin/requests', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await deleteAllRequests()
    expect(lastUrl()).toMatch(/\/__admin\/requests$/)
    expect(lastInit().method).toBe('DELETE')
  })

  it('encodes the id segment when deleting a single request', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await deleteRequest('id with spaces')
    expect(lastUrl()).toMatch(/\/__admin\/requests\/id%20with%20spaces$/)
    expect(lastInit().method).toBe('DELETE')
  })

  it('propagates backend errors', async () => {
    ;(fetch as any).mockResolvedValueOnce(
      jsonResponse({ detail: 'Unauthorized' }, { status: 401 }),
    )
    await expect(deleteAllRequests()).rejects.toThrow('Unauthorized')
  })
})

describe('removeRequestsByPattern', () => {
  it('returns ids extracted from the requestsRemoved fallback when ids is missing', async () => {
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({
      requestsRemoved: [
        { id: 'a' },
        { id: 'b' },
      ],
    }))
    const result = await removeRequestsByPattern({ url: '/x' })
    expect(result.ids).toEqual(['a', 'b'])
  })

  it('prefers an explicit ids array when present', async () => {
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({
      ids: ['x', 'y'],
      requestsRemoved: [{ id: 'a' }], // should be ignored
    }))
    const result = await removeRequestsByPattern({ url: '/x' })
    expect(result.ids).toEqual(['x', 'y'])
  })

  it('returns an empty ids array when both shapes are absent', async () => {
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({}))
    const result = await removeRequestsByPattern({ url: '/x' })
    expect(result.ids).toEqual([])
  })
})
