/**
 * Tests for the ProblemDetail-aware error parser.
 *
 * The contract: when a backend response is non-OK, surface the most
 * useful human-readable message — `detail` first (RFC 7807), then
 * common legacy shapes (`message`, `error`, `title`), and finally fall
 * back to the raw body or the caller's supplied fallback.
 */

import { describe, expect, it } from 'vitest'
import { extractApiErrorMessage, throwApiError } from './errors'

function makeResponse(body: string, status = 400): Response {
  return new Response(body, { status, statusText: 'Bad Request' })
}

describe('extractApiErrorMessage', () => {
  it('prefers ProblemDetail `detail` field', async () => {
    const body = JSON.stringify({
      title: 'Bad Request',
      status: 400,
      detail: 'Project with name X already exists',
    })
    expect(await extractApiErrorMessage(makeResponse(body), 'fallback')).toBe(
      'Project with name X already exists',
    )
  })

  it('falls back to `message` when detail is absent', async () => {
    const body = JSON.stringify({ message: 'Something broke' })
    expect(await extractApiErrorMessage(makeResponse(body), 'fallback')).toBe('Something broke')
  })

  it('falls back to `error` then `title`', async () => {
    expect(
      await extractApiErrorMessage(makeResponse(JSON.stringify({ error: 'Boom' })), 'fb'),
    ).toBe('Boom')
    expect(
      await extractApiErrorMessage(makeResponse(JSON.stringify({ title: 'Not Found' })), 'fb'),
    ).toBe('Not Found')
  })

  it('returns the raw body when JSON parse fails', async () => {
    const body = '<html>Service Unavailable</html>'
    expect(await extractApiErrorMessage(makeResponse(body), 'fallback')).toBe(body)
  })

  it('returns the fallback for an empty body', async () => {
    expect(await extractApiErrorMessage(makeResponse(''), 'fallback')).toBe('fallback')
  })

  it('skips non-string detail/message fields', async () => {
    const body = JSON.stringify({ detail: 42, message: null, error: 'usable' })
    expect(await extractApiErrorMessage(makeResponse(body), 'fb')).toBe('usable')
  })

  it('skips whitespace-only fields', async () => {
    const body = JSON.stringify({ detail: '   ', message: 'real error' })
    expect(await extractApiErrorMessage(makeResponse(body), 'fb')).toBe('real error')
  })
})

describe('throwApiError', () => {
  it('throws an Error with the extracted message', async () => {
    const body = JSON.stringify({ detail: 'Conflict reason' })
    await expect(throwApiError(makeResponse(body, 409), 'fallback')).rejects.toThrow(
      'Conflict reason',
    )
  })

  it('throws with the fallback when the body has nothing useful', async () => {
    await expect(throwApiError(makeResponse(''), 'fallback message')).rejects.toThrow(
      'fallback message',
    )
  })
})
