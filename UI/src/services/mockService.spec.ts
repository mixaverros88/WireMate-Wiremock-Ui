/**
 * Tests for the mockService compatibility shim.
 *
 * The functions are thin wrappers over `mockApi` (in ./api.ts).
 * They exist so older call sites keep compiling while the codebase
 * migrates. These tests pin the URL/method/body composition and
 * confirm the special 404-message preservation in fetchMockById.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkMockNameExists,
  checkMockUrlExists,
  cloneMock,
  deleteMock,
  fetchMockById,
  moveMock,
} from './mockService'

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
  return (fetch as any).mock.calls[(fetch as any).mock.calls.length - 1][1]
}

describe('mockService shim', () => {
  it('checkMockUrlExists GETs with ?url=', async () => {
    ;(fetch as any).mockResolvedValueOnce(ok(true))
    const result = await checkMockUrlExists('p1', '/foo')
    expect(lastUrl()).toMatch(/\/api\/mocks\/projects\/p1\/exists\/by-url\?url=%2Ffoo$/)
    expect(lastInit().method ?? 'GET').toBe('GET')
    expect(lastInit().body).toBeUndefined()
    expect(result).toBe(true)
  })

  it('checkMockNameExists GETs with ?name=', async () => {
    ;(fetch as any).mockResolvedValueOnce(ok(false))
    const result = await checkMockNameExists('p1', 'Foo')
    expect(lastUrl()).toMatch(/\/api\/mocks\/projects\/p1\/exists\/by-name\?name=Foo$/)
    expect(lastInit().method ?? 'GET').toBe('GET')
    expect(lastInit().body).toBeUndefined()
    expect(result).toBe(false)
  })

  it('deleteMock DELETEs /api/mocks/:id', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await deleteMock('m1')
    expect(lastUrl()).toMatch(/\/api\/mocks\/m1$/)
    expect(lastInit().method).toBe('DELETE')
  })

  it('cloneMock POSTs to /clone with { name }', async () => {
    ;(fetch as any).mockResolvedValueOnce(ok({ id: 'm2' }))
    await cloneMock('m1', { name: 'copy' })
    expect(lastUrl()).toMatch(/\/api\/mocks\/m1\/clone$/)
    expect(JSON.parse(lastInit().body as string)).toEqual({ name: 'copy' })
  })

  it('moveMock PUTs to /move with { targetProjectId }', async () => {
    ;(fetch as any).mockResolvedValueOnce(ok({ id: 'm1' }))
    await moveMock('m1', { targetProjectId: 'p2' })
    expect(lastUrl()).toMatch(/\/api\/mocks\/m1\/move$/)
    expect(lastInit().method).toBe('PUT')
    expect(JSON.parse(lastInit().body as string)).toEqual({ targetProjectId: 'p2' })
  })

  it('fetchMockById rewrites the legacy "not found" error message on 404', async () => {
    ;(fetch as any).mockResolvedValueOnce(
      ok({ detail: 'Mock not found' }, { status: 404 }),
    )
    await expect(fetchMockById('missing')).rejects.toThrow(/Mock missing not found/)
  })

  it('fetchMockById passes other errors through verbatim', async () => {
    ;(fetch as any).mockResolvedValueOnce(
      ok({ detail: 'Server exploded' }, { status: 500 }),
    )
    await expect(fetchMockById('m1')).rejects.toThrow('Server exploded')
  })
})
