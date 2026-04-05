/**
 * Tests for the WireMate -> Postman collection export.
 *
 * Postman is permissive about shape, so we focus on the contract bits:
 *   - The output is a valid v2.1 collection (info.schema is correct)
 *   - Concrete URL/header/body matchers round-trip into Postman literals
 *   - Regex / absent matchers degrade gracefully (disabled query param,
 *     omitted body) instead of corrupting the export
 *   - Response definition becomes an example-response entry
 *   - Round-trip via parsePostmanCollection works for the common case
 */

import { describe, expect, it } from 'vitest'
import type { MockResponse } from '../types/mock'
import { buildPostmanCollection } from './postmanExport'
import { parsePostmanCollection } from './postmanImport'

const BASE = 'http://localhost:8080'

function mock(overrides: Partial<MockResponse> = {}): MockResponse {
  return {
    id: 'mock-1',
    name: 'List users',
    projectId: 'pid',
    persistent: true,
    request: {
      method: 'GET',
      url: '/users',
    },
    response: { status: 200 },
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('buildPostmanCollection — collection envelope', () => {
  it('emits a Postman v2.1 collection envelope', () => {
    const out = buildPostmanCollection([mock()], 'My export', BASE)
    expect(out.info.name).toBe('My export')
    expect(out.info.schema).toContain('schema.getpostman.com/json/collection/v2.1.0')
    expect(out.item).toHaveLength(1)
  })
})

describe('buildPostmanCollection — request URL', () => {
  it('flips a relative WireMate URL into an absolute Postman URL', () => {
    const out = buildPostmanCollection([mock()], 'X', BASE)
    const url = out.item[0].request.url
    expect(url.raw).toBe(`${BASE}/users`)
    expect(url.path).toEqual(['users'])
    expect(url.protocol).toBe('http')
  })

  it('preserves embedded query strings on the request URL', () => {
    const out = buildPostmanCollection(
      [mock({ request: { method: 'GET', url: '/users?role=admin&active=1' } })],
      'X',
      BASE,
    )
    const url = out.item[0].request.url
    expect(url.path).toEqual(['users'])
    expect(url.query).toEqual([
      { key: 'role', value: 'admin' },
      { key: 'active', value: '1' },
    ])
  })

  it('surfaces queryParameter matchers as Postman query rows', () => {
    const out = buildPostmanCollection(
      [
        mock({
          request: {
            method: 'GET',
            url: '/users',
            queryParameters: {
              role: { equalTo: 'admin' },
              dept: { matches: '^eng.*' },   // regex — emitted disabled
            },
          },
        }),
      ],
      'X',
      BASE,
    )
    const query = out.item[0].request.url.query!
    const role = query.find((q) => q.key === 'role')!
    const dept = query.find((q) => q.key === 'dept')!
    expect(role.value).toBe('admin')
    expect(role.disabled).toBeUndefined()
    expect(dept.disabled).toBe(true) // regex matchers can't carry a literal value
  })

  it('falls back through urlPath / urlPattern / urlPathPattern', () => {
    const out = buildPostmanCollection(
      [
        mock({ request: { method: 'GET', urlPath: '/abc' } }),
        mock({ request: { method: 'GET', urlPattern: '/x/.*' } }),
      ],
      'X',
      BASE,
    )
    expect(out.item[0].request.url.path).toEqual(['abc'])
    // Regex pattern flows through as literal — best-effort.
    expect(out.item[1].request.url.raw).toContain('/x/.*')
  })
})

describe('buildPostmanCollection — methods + body', () => {
  it('downgrades ANY to POST when a body is present, GET otherwise', () => {
    const withBody = mock({
      request: { method: 'ANY', url: '/x', bodyPatterns: [{ equalTo: 'payload' }] },
    })
    const withoutBody = mock({ request: { method: 'ANY', url: '/x' } })
    const out = buildPostmanCollection([withBody, withoutBody], 'X', BASE)
    expect(out.item[0].request.method).toBe('POST')
    expect(out.item[1].request.method).toBe('GET')
  })

  it('emits a raw text body for equalTo bodyPattern', () => {
    const out = buildPostmanCollection(
      [mock({ request: { method: 'POST', url: '/x', bodyPatterns: [{ equalTo: 'hi' }] } })],
      'X',
      BASE,
    )
    expect(out.item[0].request.body).toEqual({
      mode: 'raw',
      raw: 'hi',
      options: { raw: { language: 'text' } },
    })
  })

  it('serialises an equalToJson body as JSON with the right language', () => {
    const out = buildPostmanCollection(
      [
        mock({
          request: {
            method: 'POST',
            url: '/x',
            bodyPatterns: [{ equalToJson: { a: 1 } }],
          },
        }),
      ],
      'X',
      BASE,
    )
    expect(out.item[0].request.body!.options!.raw!.language).toBe('json')
    expect(JSON.parse(out.item[0].request.body!.raw)).toEqual({ a: 1 })
  })

  it('attaches a Content-Type header when emitting a JSON body without one', () => {
    const out = buildPostmanCollection(
      [
        mock({
          request: {
            method: 'POST',
            url: '/x',
            bodyPatterns: [{ equalToJson: { a: 1 } }],
          },
        }),
      ],
      'X',
      BASE,
    )
    expect(out.item[0].request.header.some((h) => h.key === 'Content-Type')).toBe(true)
  })
})

describe('buildPostmanCollection — example response', () => {
  it('attaches the response as a Postman example with status + headers + body', () => {
    const out = buildPostmanCollection(
      [
        mock({
          response: {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            jsonBody: { hello: 'world' },
          },
        }),
      ],
      'X',
      BASE,
    )
    const example = out.item[0].response[0]
    expect(example.code).toBe(200)
    expect(JSON.parse(example.body)).toEqual({ hello: 'world' })
    expect(example._postman_previewlanguage).toBe('json')
  })

  it('expands a multi-value response header into multiple entries', () => {
    const out = buildPostmanCollection(
      [
        mock({
          response: {
            status: 200,
            headers: { 'Set-Cookie': ['a=1', 'b=2'] },
          },
        }),
      ],
      'X',
      BASE,
    )
    const cookies = out.item[0].response[0].header.filter((h) => h.key === 'Set-Cookie')
    expect(cookies.map((c) => c.value)).toEqual(['a=1', 'b=2'])
  })
})

describe('buildPostmanCollection — round-trip', () => {
  it('produces a collection that the import path can read back', () => {
    const original = mock({
      request: {
        method: 'POST',
        url: '/round-trip',
        headers: { Authorization: { equalTo: 'Bearer x' } },
        bodyPatterns: [{ equalToJson: { ok: true } }],
      },
      response: {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: { created: true },
      },
    })
    const collection = buildPostmanCollection([original], 'X', BASE)
    const reparsed = parsePostmanCollection(collection, 'pid')
    expect(reparsed.requests).toHaveLength(1)
    const r = reparsed.requests[0]
    expect(r.method).toBe('POST')
    expect(r.path).toBe('/round-trip')
    // Header survives, dropping transport ones.
    expect(r.payload.request.headers).toBeDefined()
    expect(r.payload.request.headers!.Authorization).toEqual({ equalTo: 'Bearer x' })
  })
})
