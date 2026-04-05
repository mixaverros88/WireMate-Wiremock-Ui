/**
 * Tests for the WireMock stubService.
 *
 * The interesting bit is `checkStubExists` — it has bespoke retry
 * behaviour because WireMock's admin Jetty returns 503 under
 * concurrent load. The "did the stub exist?" answer must distinguish
 * a true 404 from a transient hiccup; these tests pin that down.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkStubExists, deleteAllStubs, deleteStub, fetchAllStubs } from './stubService'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('fetchAllStubs', () => {
  it('passes limit/offset through as query parameters', async () => {
    ;(fetch as any).mockResolvedValueOnce(ok({ mappings: [], meta: { total: 0 } }))
    await fetchAllStubs({ limit: 50, offset: 100 })
    const [url] = (fetch as any).mock.calls[0]
    expect(url).toContain('limit=50')
    expect(url).toContain('offset=100')
  })

  it('omits query string when no params are provided', async () => {
    ;(fetch as any).mockResolvedValueOnce(ok({ mappings: [], meta: { total: 0 } }))
    await fetchAllStubs()
    const [url] = (fetch as any).mock.calls[0]
    expect(url).not.toContain('?')
  })
})

describe('deleteAllStubs', () => {
  it('issues a single DELETE /__admin/mappings (no query string, no body)', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 200 }))
    await deleteAllStubs()
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (fetch as any).mock.calls[0]
    expect(String(url)).toMatch(/\/__admin\/mappings$/)
    expect(init.method).toBe('DELETE')
    // No request body — DELETE /mappings is parameterless.
    expect(init.body).toBeUndefined()
  })

  it('propagates the backend error on failure', async () => {
    ;(fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'WireMock down' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(deleteAllStubs()).rejects.toThrow('WireMock down')
  })
})

describe('deleteStub', () => {
  it('returns a success descriptor on a 200/204', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 204 }))
    const result = await deleteStub('stub-1')
    expect(result.success).toBe(true)
    expect(result.message).toContain('stub-1')
  })

  it('propagates the backend error on failure', async () => {
    ;(fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Permission denied' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(deleteStub('stub-1')).rejects.toThrow('Permission denied')
  })
})

describe('checkStubExists', () => {
  it('returns true for a 200', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response('{}', { status: 200 }))
    expect(await checkStubExists('id-1')).toBe(true)
  })

  it('returns false for a 404 (no retry — that is a real answer)', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 404 }))
    expect(await checkStubExists('id-1')).toBe(false)
    expect((fetch as any).mock.calls).toHaveLength(1)
  })

  it('retries on a 503, then accepts the eventual 200', async () => {
    ;(fetch as any)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    expect(await checkStubExists('id-1')).toBe(true)
    expect((fetch as any).mock.calls).toHaveLength(3)
  })

  it('gives up after the third 503 and throws', async () => {
    ;(fetch as any)
      .mockResolvedValue(new Response(null, { status: 503 }))
    await expect(checkStubExists('id-1')).rejects.toThrow()
  })

  it('throws immediately for an unexpected 4xx other than 404', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 401 }))
    await expect(checkStubExists('id-1')).rejects.toThrow(/Unexpected status 401/)
    expect((fetch as any).mock.calls).toHaveLength(1)
  })

  it('retries on a network error and resolves on a subsequent success', async () => {
    ;(fetch as any)
      .mockRejectedValueOnce(new TypeError('network blip'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    expect(await checkStubExists('id-1')).toBe(true)
  })
})
