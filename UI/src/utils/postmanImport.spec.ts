/**
 * Tests for the Postman v2.x → WireMate import.
 *
 * The parser is deliberately permissive (missing fields fall back to
 * defaults), so these tests focus on round-trip correctness of the
 * common cases plus the trickier branches:
 *   - Postman path variables ({{var}}, :param) translate to WireMock placeholders
 *   - The WireMock admin-API passthrough case (a Postman request whose
 *     body IS a stub mapping) bypasses the URL-based path
 *   - Folder names compose into the mock name
 *   - Headers Postman auto-emits (Host, User-Agent, ...) are dropped
 */

import { describe, expect, it } from 'vitest'
import { PostmanParseError, parsePostmanCollection } from './postmanImport'

const PROJECT_ID = 'pid-123'

function postmanCollection(items: any[], variable: any[] = []): unknown {
  return {
    info: {
      name: 'My API',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: items,
    variable,
  }
}

describe('parsePostmanCollection — error paths', () => {
  it('rejects non-objects', () => {
    expect(() => parsePostmanCollection(null, PROJECT_ID)).toThrow(PostmanParseError)
    expect(() => parsePostmanCollection('a string', PROJECT_ID)).toThrow(PostmanParseError)
  })

  it('rejects objects with no Postman shape', () => {
    expect(() => parsePostmanCollection({ foo: 'bar' }, PROJECT_ID)).toThrow(PostmanParseError)
  })

  it('rejects collections with no importable requests', () => {
    expect(() =>
      parsePostmanCollection(postmanCollection([]), PROJECT_ID),
    ).toThrow(/no requests/i)
  })
})

describe('parsePostmanCollection — basic GET request', () => {
  it('converts a simple GET into a WireMate mock payload', () => {
    const result = parsePostmanCollection(
      postmanCollection([
        {
          name: 'Get user',
          request: {
            method: 'GET',
            url: { raw: 'https://api.example.com/users/42', path: ['users', '42'] },
          },
        },
      ]),
      PROJECT_ID,
    )

    expect(result.collectionName).toBe('My API')
    expect(result.requests).toHaveLength(1)
    const r = result.requests[0]
    expect(r.method).toBe('GET')
    expect(r.path).toBe('/users/42')
    expect(r.payload.projectId).toBe(PROJECT_ID)
    expect(r.payload.request.method).toBe('GET')
    expect(r.payload.request.url).toBe('/users/42')
    expect(r.payload.response.status).toBe(200) // default
  })

  it('substitutes Postman {{vars}} from the collection scope', () => {
    const result = parsePostmanCollection(
      postmanCollection(
        [
          {
            name: 'X',
            request: {
              method: 'GET',
              url: { raw: '{{baseUrl}}/widgets', path: ['widgets'] },
            },
          },
        ],
        [{ key: 'baseUrl', value: 'https://api.example.com' }],
      ),
      PROJECT_ID,
    )
    // baseUrl is consumed at the host level, so the resulting path stays /widgets.
    expect(result.requests[0].path).toBe('/widgets')
  })

  it('translates Postman :param style path placeholders to {param}', () => {
    const result = parsePostmanCollection(
      postmanCollection([
        {
          name: 'Find',
          request: { method: 'GET', url: { raw: '/users/:id/posts/:pid' } },
        },
      ]),
      PROJECT_ID,
    )
    expect(result.requests[0].path).toBe('/users/{id}/posts/{pid}')
  })
})

describe('parsePostmanCollection — headers + body', () => {
  it('drops transport / auto headers but keeps real ones', () => {
    const result = parsePostmanCollection(
      postmanCollection([
        {
          name: 'X',
          request: {
            method: 'GET',
            url: { path: ['x'] },
            header: [
              { key: 'Host', value: 'example.com' },         // dropped
              { key: 'User-Agent', value: 'curl/7.79' },     // dropped
              { key: 'X-Custom', value: 'keep-me' },         // kept
              { key: 'Content-Length', value: '0' },         // dropped
              { key: 'Disabled-One', value: 'ghost', disabled: true }, // skipped
            ],
          },
        },
      ]),
      PROJECT_ID,
    )
    const headers = result.requests[0].payload.request.headers
    expect(headers).toBeDefined()
    expect(Object.keys(headers!)).toEqual(['X-Custom'])
    expect(headers!['X-Custom']).toEqual({ equalTo: 'keep-me' })
  })

  it('parses a JSON body into an equalToJson body pattern', () => {
    const result = parsePostmanCollection(
      postmanCollection([
        {
          name: 'X',
          request: {
            method: 'POST',
            url: { path: ['x'] },
            body: { mode: 'raw', raw: '{"a": 1}', options: { raw: { language: 'json' } } },
          },
        },
      ]),
      PROJECT_ID,
    )
    const patterns = result.requests[0].payload.request.bodyPatterns!
    expect(patterns).toHaveLength(1)
    expect(patterns[0].equalToJson).toBe('{"a": 1}')
    expect(patterns[0].ignoreArrayOrder).toBe(true)
    expect(patterns[0].ignoreExtraElements).toBe(true)
  })

  it('falls through to equalTo when the body is not valid JSON', () => {
    const result = parsePostmanCollection(
      postmanCollection([
        {
          name: 'X',
          request: {
            method: 'POST',
            url: { path: ['x'] },
            body: { mode: 'raw', raw: 'not really {valid' },
          },
        },
      ]),
      PROJECT_ID,
    )
    const patterns = result.requests[0].payload.request.bodyPatterns!
    expect(patterns[0].equalTo).toBe('not really {valid')
  })

  it('uses the first response example to seed status + body', () => {
    const result = parsePostmanCollection(
      postmanCollection([
        {
          name: 'X',
          request: { method: 'GET', url: { path: ['x'] } },
          response: [
            {
              name: '404 example',
              code: 404,
              header: [{ key: 'Content-Type', value: 'application/json' }],
              body: '{"error":"missing"}',
            },
          ],
        },
      ]),
      PROJECT_ID,
    )
    const resp = result.requests[0].payload.response
    expect(resp.status).toBe(404)
    expect(resp.jsonBody).toEqual({ error: 'missing' })
    expect(resp.headers).toBeDefined()
  })
})

describe('parsePostmanCollection — folder recursion', () => {
  it('joins parent folder names into the mock name', () => {
    const result = parsePostmanCollection(
      postmanCollection([
        {
          name: 'Users',
          item: [
            {
              name: 'Detail',
              item: [
                {
                  name: 'Get one',
                  request: { method: 'GET', url: { path: ['users', '1'] } },
                },
              ],
            },
          ],
        },
      ]),
      PROJECT_ID,
    )
    expect(result.requests[0].name).toBe('Users / Detail / Get one')
    expect(result.requests[0].folderPath).toEqual(['Users', 'Detail'])
  })
})

describe('parsePostmanCollection — WireMock admin passthrough', () => {
  it('reads the request body as the stub mapping when posting to /__admin/mappings', () => {
    const mapping = {
      name: 'Direct stub',
      request: { method: 'GET', urlPath: '/admin-flow' },
      response: { status: 418, body: 'teapot' },
      priority: 5,
    }
    const result = parsePostmanCollection(
      postmanCollection([
        {
          name: 'WireMock direct',
          request: {
            method: 'POST',
            url: { path: ['__admin', 'mappings'] },
            body: { mode: 'raw', raw: JSON.stringify(mapping) },
          },
        },
      ]),
      PROJECT_ID,
    )
    const r = result.requests[0]
    // Takes the mapping's URL/method, not the POST's.
    expect(r.method).toBe('GET')
    expect(r.path).toBe('/admin-flow')
    expect(r.payload.response.status).toBe(418)
    expect(r.payload.response.body).toBe('teapot')
    expect(r.payload.priority).toBe(5)
  })

  it('falls through to the normal path when the admin-mapping body is not valid JSON', () => {
    const result = parsePostmanCollection(
      postmanCollection([
        {
          name: 'WireMock direct broken',
          request: {
            method: 'POST',
            url: { path: ['__admin', 'mappings'] },
            body: { mode: 'raw', raw: 'not json' },
          },
        },
      ]),
      PROJECT_ID,
    )
    // Treated as a regular Postman request.
    expect(result.requests[0].method).toBe('POST')
    expect(result.requests[0].path).toBe('/__admin/mappings')
  })
})
