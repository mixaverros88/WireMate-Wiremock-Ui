/**
 * Tests for settingsService — every endpoint is a thin wrapper around
 * the shared `request<T>` helper. The point of these tests is to pin
 * URL + method + body composition so a typo in a path would fail loudly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchHealth,
  fetchNearMisses,
  fetchVersion,
  resetAll,
  shutdownServer,
} from './settingsService'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function ok(body: unknown, init: ResponseInit = { status: 200 }): Response {
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

describe('settingsService — near misses + settings + admin', () => {
  it('fetchNearMisses GETs /__admin/requests/unmatched/near-misses', async () => {
    ;(fetch as any).mockResolvedValueOnce(ok({ nearMisses: [] }))
    await fetchNearMisses()
    expect(lastUrl()).toMatch(/\/__admin\/requests\/unmatched\/near-misses$/)
  })

  it('resetAll POSTs /__admin/reset', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await resetAll()
    expect(lastUrl()).toMatch(/\/__admin\/reset$/)
    expect(lastInit().method).toBe('POST')
  })

  it('shutdownServer POSTs /__admin/shutdown', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await shutdownServer()
    expect(lastUrl()).toMatch(/\/__admin\/shutdown$/)
    expect(lastInit().method).toBe('POST')
  })

  it('fetchHealth GETs /__admin/health', async () => {
    ;(fetch as any).mockResolvedValueOnce(ok({
      status: 'healthy', version: '1.0', uptimeInSeconds: 10, timestamp: '', message: '',
    }))
    const result = await fetchHealth()
    expect(lastUrl()).toMatch(/\/__admin\/health$/)
    expect(result.status).toBe('healthy')
  })

  it('fetchVersion GETs /__admin/version', async () => {
    ;(fetch as any).mockResolvedValueOnce(ok({ version: '1.2.3' }))
    const result = await fetchVersion()
    expect(lastUrl()).toMatch(/\/__admin\/version$/)
    expect(result.version).toBe('1.2.3')
  })
})

describe('settingsService — error surfacing', () => {
  it('propagates ProblemDetail messages from the shared helper', async () => {
    ;(fetch as any).mockResolvedValueOnce(
      ok({ detail: 'Admin port unreachable' }, { status: 502 }),
    )
    await expect(fetchHealth()).rejects.toThrow('Admin port unreachable')
  })
})
