// WireMate mocks → Postman Collection v2.1 converter.
// Runs client-side. Accepts a list of MockResponse objects and returns a
// Postman collection (plain JS object ready to JSON.stringify + download)
// that can be imported into Postman via File → Import.
//
// Scope: this is an "executable requests" export, not a round-trip of every
// WireMock matcher. A Postman request is a concrete HTTP call, so features
// that describe matching logic (regex matchers, JSONPath/XPath, absent,
// caseInsensitive, multiple body patterns, custom matchers, etc.) have no
// direct Postman equivalent and are skipped — but the most common cases
// (concrete URL + headers + literal body) round-trip cleanly through
// parsePostmanCollection().
//
// The response definition's example body, if present, is attached as a
// Postman "response example" so users can see the mocked response in
// Postman's UI after importing.

import type {
  MockResponse,
  RequestDefinition,
  ResponseDefinition,
  StringMatcher,
  BodyPattern,
} from '../types/mock'

// ── Postman v2.1 shapes (minimal — only what we emit) ──────────────

interface PostmanKV {
  key: string
  value: string
  disabled?: boolean
}

interface PostmanUrl {
  raw: string
  protocol?: string
  host?: string[]
  port?: string
  path: string[]
  query?: PostmanKV[]
}

interface PostmanBody {
  mode: 'raw'
  raw: string
  options?: { raw: { language: 'json' | 'xml' | 'text' } }
}

interface PostmanRequest {
  method: string
  header: PostmanKV[]
  url: PostmanUrl
  body?: PostmanBody
  auth?: {
    type: 'basic'
    basic: PostmanKV[]
  }
  description?: string
}

interface PostmanResponse {
  name: string
  originalRequest: PostmanRequest
  status?: string
  code: number
  header: PostmanKV[]
  body: string
  _postman_previewlanguage?: 'json' | 'xml' | 'text'
}

interface PostmanItem {
  name: string
  request: PostmanRequest
  response: PostmanResponse[]
}

interface PostmanCollection {
  info: {
    _postman_id?: string
    name: string
    description?: string
    schema: string
    _exporter_id?: string
  }
  item: PostmanItem[]
}

// ── Public API ─────────────────────────────────────────────────────

export function buildPostmanCollection(
  mocks: MockResponse[],
  collectionName: string,
  baseUrl: string,
): PostmanCollection {
  return {
    info: {
      name: collectionName,
      description: 'Exported from WireMate. Each request corresponds to a WireMock stub mapping.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: mocks.map(m => buildItem(m, baseUrl)),
  }
}

export function buildPostmanItemFromMock(
  mock: MockResponse,
  baseUrl: string,
): PostmanItem {
  return buildItem(mock, baseUrl)
}

// ── Item builder ───────────────────────────────────────────────────

function buildItem(mock: MockResponse, baseUrl: string): PostmanItem {
  const request = buildRequest(mock.request, baseUrl, mock.description)
  const exampleResponse = buildExampleResponse(mock.response, request, mock.name)
  return {
    name: mock.name,
    request,
    response: exampleResponse ? [exampleResponse] : [],
  }
}

// ── Request ────────────────────────────────────────────────────────

function buildRequest(
  req: RequestDefinition,
  baseUrl: string,
  description: string | undefined,
): PostmanRequest {
  // Postman requires a concrete method. `ANY` isn't valid HTTP, so choose a
  // sensible default based on whether a body is present.
  const rawMethod = (req.method ?? 'GET').toUpperCase()
  const hasBody = Boolean(req.bodyPatterns && req.bodyPatterns.length > 0)
  const method = rawMethod === 'ANY' ? (hasBody ? 'POST' : 'GET') : rawMethod

  const path = resolvePath(req)
  const url = buildUrl(baseUrl, path, req.queryParameters)
  const header = buildHeaders(req.headers)
  const body = buildBody(req.bodyPatterns)

  // If the request has a literal JSON/XML body and no Content-Type header,
  // add one so Postman sends it with the expected media type.
  if (body && !header.some(h => h.key.toLowerCase() === 'content-type')) {
    const lang = body.options?.raw?.language
    const ct = lang === 'json' ? 'application/json'
      : lang === 'xml' ? 'application/xml'
      : 'text/plain'
    header.push({ key: 'Content-Type', value: ct })
  }

  const out: PostmanRequest = { method, header, url }
  if (body) out.body = body
  if (req.basicAuthCredentials) {
    out.auth = {
      type: 'basic',
      basic: [
        { key: 'username', value: req.basicAuthCredentials.username },
        { key: 'password', value: req.basicAuthCredentials.password },
      ],
    }
  }
  if (description) out.description = description
  return out
}

function resolvePath(req: RequestDefinition): string {
  // Prefer concrete matchers over regex patterns. Regex patterns are not
  // meaningful as a Postman URL, but we still round-trip them as literals so
  // the user has *something* to edit in Postman.
  const raw = req.url ?? req.urlPath ?? req.urlPattern ?? req.urlPathPattern ?? '/'
  return raw.startsWith('/') ? raw : `/${raw}`
}

function buildUrl(
  baseUrl: string,
  pathAndQuery: string,
  queryParameters: Record<string, StringMatcher> | undefined,
): PostmanUrl {
  // `pathAndQuery` may already include an embedded ?query=string (when the
  // stub uses `url` for exact match); peel it off so query params stay in the
  // structured `query` array.
  const [pathOnly, inlineQuery] = splitQuery(pathAndQuery)
  const origin = baseUrl.replace(/\/$/, '')

  let protocol: string | undefined
  let host: string[] | undefined
  let port: string | undefined
  try {
    const parsed = new URL(origin)
    protocol = parsed.protocol.replace(/:$/, '') || undefined
    host = parsed.hostname ? parsed.hostname.split('.') : undefined
    port = parsed.port || undefined
  } catch {
    // Leave structured fields undefined; `raw` still gives Postman something
    // usable.
  }

  const pathSegments = pathOnly
    .split('/')
    .filter(seg => seg.length > 0)

  const query: PostmanKV[] = []
  if (inlineQuery) {
    for (const pair of inlineQuery.split('&')) {
      if (!pair) continue
      const eq = pair.indexOf('=')
      const key = eq >= 0 ? pair.slice(0, eq) : pair
      const value = eq >= 0 ? pair.slice(eq + 1) : ''
      query.push({
        key: safeDecode(key),
        value: safeDecode(value),
      })
    }
  }
  if (queryParameters) {
    for (const [key, matcher] of Object.entries(queryParameters)) {
      const value = literalFromMatcher(matcher)
      // Matchers we can't represent as a literal (regex, absent, etc.) are
      // still surfaced as disabled entries so the user sees them in Postman.
      query.push({
        key,
        value: value ?? '',
        ...(value === null ? { disabled: true } : {}),
      })
    }
  }

  const raw = buildRawUrl(origin, pathSegments, query)

  return {
    raw,
    ...(protocol ? { protocol } : {}),
    ...(host ? { host } : {}),
    ...(port ? { port } : {}),
    path: pathSegments,
    ...(query.length > 0 ? { query } : {}),
  }
}

function splitQuery(pathAndQuery: string): [string, string] {
  const qIdx = pathAndQuery.indexOf('?')
  if (qIdx < 0) return [pathAndQuery, '']
  return [pathAndQuery.slice(0, qIdx), pathAndQuery.slice(qIdx + 1)]
}

function safeDecode(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}

function buildRawUrl(origin: string, pathSegments: string[], query: PostmanKV[]): string {
  const path = pathSegments.length > 0 ? '/' + pathSegments.join('/') : '/'
  const qs = query
    .filter(q => q.disabled !== true)
    .map(q => `${encodeURIComponent(q.key)}=${encodeURIComponent(q.value)}`)
    .join('&')
  return qs ? `${origin}${path}?${qs}` : `${origin}${path}`
}

// ── Headers ────────────────────────────────────────────────────────

function buildHeaders(headers: Record<string, StringMatcher> | undefined): PostmanKV[] {
  if (!headers) return []
  const out: PostmanKV[] = []
  for (const [key, matcher] of Object.entries(headers)) {
    const value = literalFromMatcher(matcher)
    // Regex/absent header matchers: disable the entry so Postman doesn't
    // send a meaningless value, but keep it visible to the user.
    out.push({
      key,
      value: value ?? '',
      ...(value === null ? { disabled: true } : {}),
    })
  }
  return out
}

// Returns a literal string that best represents the matcher, or null if no
// concrete value can be derived (regex, absent, JSONPath on a query, etc.).
function literalFromMatcher(matcher: StringMatcher): string | null {
  if (matcher.equalTo !== undefined) return matcher.equalTo
  if (matcher.contains !== undefined) return matcher.contains
  if (matcher.equalToJson !== undefined) return matcher.equalToJson
  if (matcher.equalToXml !== undefined) return matcher.equalToXml
  if (matcher.binaryEqualTo !== undefined) return matcher.binaryEqualTo
  // Date matchers are concrete values, even if Postman won't match them.
  if (matcher.equalToDateTime !== undefined) return matcher.equalToDateTime
  if (matcher.before !== undefined) return matcher.before
  if (matcher.after !== undefined) return matcher.after
  return null
}

// ── Body ───────────────────────────────────────────────────────────

function buildBody(bodyPatterns: BodyPattern[] | undefined): PostmanBody | undefined {
  if (!bodyPatterns || bodyPatterns.length === 0) return undefined
  // Pick the first matcher that corresponds to a literal body. Regex and
  // JSONPath matchers describe shape, not a concrete payload, so emitting
  // them as a Postman request body would be misleading.
  for (const bp of bodyPatterns) {
    if (bp.equalToJson !== undefined) {
      const raw = typeof bp.equalToJson === 'string'
        ? bp.equalToJson
        : JSON.stringify(bp.equalToJson, null, 2)
      return {
        mode: 'raw',
        raw,
        options: { raw: { language: 'json' } },
      }
    }
    if (bp.equalToXml !== undefined) {
      return {
        mode: 'raw',
        raw: bp.equalToXml,
        options: { raw: { language: 'xml' } },
      }
    }
    if (bp.equalTo !== undefined) {
      return {
        mode: 'raw',
        raw: bp.equalTo,
        options: { raw: { language: 'text' } },
      }
    }
    if (bp.binaryEqualTo !== undefined) {
      // Base64 payload — surface it as text so the user at least has the
      // bytes in a form Postman can display.
      return {
        mode: 'raw',
        raw: bp.binaryEqualTo,
        options: { raw: { language: 'text' } },
      }
    }
  }
  return undefined
}

// ── Example response ───────────────────────────────────────────────

function buildExampleResponse(
  res: ResponseDefinition,
  originalRequest: PostmanRequest,
  name: string,
): PostmanResponse | null {
  const header: PostmanKV[] = []
  if (res.headers) {
    for (const [key, value] of Object.entries(res.headers)) {
      // WireMock allows headers to be `string | string[]` — e.g. `Set-Cookie`
      // may legitimately appear multiple times on a response. Postman's
      // example-response format expects a single string per header entry,
      // so we emit one row per value and let Postman render them as
      // repeated headers.
      if (Array.isArray(value)) {
        for (const v of value) {
          header.push({ key, value: v })
        }
      } else {
        header.push({ key, value })
      }
    }
  }

  let body = ''
  let language: 'json' | 'xml' | 'text' = 'text'
  if (res.jsonBody !== undefined) {
    body = JSON.stringify(res.jsonBody, null, 2)
    language = 'json'
    if (!header.some(h => h.key.toLowerCase() === 'content-type')) {
      header.push({ key: 'Content-Type', value: 'application/json' })
    }
  } else if (res.body !== undefined) {
    body = res.body
    const ct = header.find(h => h.key.toLowerCase() === 'content-type')?.value.toLowerCase() ?? ''
    if (ct.includes('json')) language = 'json'
    else if (ct.includes('xml')) language = 'xml'
  } else if (res.base64Body !== undefined) {
    body = res.base64Body
  } else if (res.bodyFileName !== undefined) {
    body = `// Body served from file: ${res.bodyFileName}`
  }

  // If the response has nothing distinguishing beyond a bare status code,
  // Postman still benefits from seeing an example, so we always emit one
  // (even if body is empty) whenever we have any status/headers.
  return {
    name: `${name} — example response`,
    originalRequest,
    status: res.statusMessage,
    code: res.status,
    header,
    body,
    _postman_previewlanguage: language,
  }
}
