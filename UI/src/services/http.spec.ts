/**
 * Tests for the shared HTTP helper used by every service module.
 *
 * The helper is responsible for three things every service module used
 * to reimplement differently:
 *   1. Default `Content-Type: application/json` on requests
 *   2. Cleanly resolve to `undefined` on 204 / empty bodies (no JSON
 *      parse error)
 *   3. Throw an Error whose message is the backend's ProblemDetail
 *      `detail` text on non-OK responses
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request, requestNoBody } from './http'

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

describe('request<T>', () => {
  it('parses a JSON 200 response into T', async () => {
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({ id: 'abc' }))
    const result = await request<{ id: string }>('/api/x')
    expect(result.id).toBe('abc')
  })

  it('defaults Content-Type: application/json', async () => {
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({}))
    await request('/api/x', { method: 'POST', body: '{}' })
    const [, init] = (fetch as any).mock.calls[0]
    const headers = init.headers as Headers
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('respects an explicit Content-Type override', async () => {
    ;(fetch as any).mockResolvedValueOnce(jsonResponse({}))
    await request('/api/x', {
      method: 'POST',
      body: 'plain',
      headers: { 'Content-Type': 'text/plain' },
    })
    const [, init] = (fetch as any).mock.calls[0]
    expect((init.headers as Headers).get('Content-Type')).toBe('text/plain')
  })

  it('returns undefined for 204 No Content', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 204 }))
    const result = await request<void>('/api/x')
    expect(result).toBeUndefined()
  })

  it('returns undefined for 200 with an empty body', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 200 }))
    const result = await request<void>('/api/x')
    expect(result).toBeUndefined()
  })

  it('throws with the ProblemDetail `detail` field on a 4xx response', async () => {
    ;(fetch as any).mockResolvedValueOnce(
      jsonResponse({ detail: 'Mock name already exists' }, { status: 409 }),
    )
    await expect(request('/api/x')).rejects.toThrow('Mock name already exists')
  })

  it('throws with the caller-supplied fallback when no error fields are present', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 500 }))
    await expect(
      request('/api/x', { errorFallback: 'Failed to create stub' }),
    ).rejects.toThrow('Failed to create stub')
  })

  it('throws with a descriptive error when the response body is not valid JSON', async () => {
    ;(fetch as any).mockResolvedValueOnce(
      new Response('not json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(request('/api/x')).rejects.toThrow(/Invalid JSON response/)
  })

  it('returns raw text when parseJson is false', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response('not json', { status: 200 }))
    const result = await request<string>('/api/x', { parseJson: false })
    expect(result).toBe('not json')
  })
})

describe('requestNoBody', () => {
  it('resolves to undefined on success', async () => {
    // Spec: a 204 response MUST NOT have a body. Some fetch impls
    // throw if you pass an empty string here, so use `null`.
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(requestNoBody('/api/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('propagates errors the same as request()', async () => {
    ;(fetch as any).mockResolvedValueOnce(
      jsonResponse({ detail: 'Conflict' }, { status: 409 }),
    )
    await expect(requestNoBody('/api/x', { method: 'DELETE' })).rejects.toThrow('Conflict')
  })
})
