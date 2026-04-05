// Postman Collection v2.x → WireMate mock payload converter.
// Runs client-side. Accepts parsed JSON, returns CreateMockPayload[] ready
// for mockApi.create(). The parser is deliberately permissive: fields that
// are missing fall back to sensible defaults rather than rejecting the input.

import type {
  CreateMockPayload,
  RequestDefinition,
  ResponseDefinition,
  StringMatcher,
  BodyPattern,
} from '../types/mock'

// ── Postman schema (minimal, only the bits we read) ──────────────

interface PostmanKV {
  key: string
  value?: string
  disabled?: boolean
}

interface PostmanUrl {
  raw?: string
  host?: string[] | string
  path?: string[] | string
  query?: PostmanKV[]
}

interface PostmanBody {
  mode?: string
  raw?: string
  options?: { raw?: { language?: string } }
}

interface PostmanRequest {
  method?: string
  header?: PostmanKV[]
  url?: PostmanUrl | string
  body?: PostmanBody
}

interface PostmanResponse {
  name?: string
  status?: string
  code?: number
  header?: PostmanKV[]
  body?: string
}

interface PostmanItem {
  name?: string
  request?: PostmanRequest
  response?: PostmanResponse[]
  item?: PostmanItem[]
}

interface PostmanCollection {
  info?: { name?: string; schema?: string }
  item?: PostmanItem[]
  variable?: PostmanKV[]
}

export interface ParsedRequest {
  name: string
  method: string
  path: string
  folderPath: string[]
  payload: CreateMockPayload
}

export interface ParseResult {
  collectionName: string
  requests: ParsedRequest[]
}

// Headers Postman emits automatically that would make matchers too strict.
const SKIP_HEADERS = new Set([
  'host',
  'content-length',
  'postman-token',
  'user-agent',
  'accept-encoding',
  'connection',
  'cache-control',
])

export class PostmanParseError extends Error {}

// ── Public API ──────────────────────────────────────────────────

export function parsePostmanCollection(
  raw: unknown,
  projectId: string,
): ParseResult {
  if (!raw || typeof raw !== 'object') {
    throw new PostmanParseError('File is not a valid JSON object')
  }
  const collection = raw as PostmanCollection
  const schema = collection.info?.schema ?? ''
  if (!schema.includes('schema.getpostman.com') && !Array.isArray(collection.item)) {
    throw new PostmanParseError(
      'File does not look like a Postman collection (missing "info.schema" or "item")',
    )
  }

  const variables = buildVariableMap(collection.variable)
  const requests: ParsedRequest[] = []
  walkItems(collection.item ?? [], [], variables, projectId, requests)

  if (requests.length === 0) {
    throw new PostmanParseError('Collection contains no requests to import')
  }

  return {
    collectionName: collection.info?.name ?? 'Postman Collection',
    requests,
  }
}

// ── Walkers ─────────────────────────────────────────────────────

function walkItems(
  items: PostmanItem[],
  folderPath: string[],
  variables: Map<string, string>,
  projectId: string,
  out: ParsedRequest[],
): void {
  for (const item of items) {
    if (Array.isArray(item.item)) {
      // Folder — recurse with updated path
      walkItems(
        item.item,
        item.name ? [...folderPath, item.name] : folderPath,
        variables,
        projectId,
        out,
      )
      continue
    }
    if (!item.request) continue
    const parsed = convertItem(item, folderPath, variables, projectId)
    if (parsed) out.push(parsed)
  }
}

function convertItem(
  item: PostmanItem,
  folderPath: string[],
  variables: Map<string, string>,
  projectId: string,
): ParsedRequest | null {
  const req = item.request
  if (!req) return null

  // Special case: some Postman collections document WireMock itself — each
  // request is a POST to /__admin/mappings whose body IS the stub mapping.
  // In that case, treat the body as the source of truth instead of the
  // Postman request's own URL/method.
  const adminMapping = tryExtractAdminMapping(req, variables)
  if (adminMapping) {
    return buildFromAdminMapping(adminMapping, item, folderPath, projectId)
  }

  const method = (req.method ?? 'GET').toUpperCase()
  const path = extractPath(req.url, variables)
  const name = buildName(item.name, folderPath, method, path)

  // Use WireMock's `url` field so the imported value round-trips as the
  // mock's visible URL in the UI (the mocks list only surfaces `url` /
  // `urlPattern` / `urlPathPattern`, not `urlPath`). `url` is an exact match
  // on path + query; since Postman query params are usually example values
  // the user wouldn't want to hard-match on, we drop them and keep only the
  // path. Users can tighten query matching after import if needed.
  const request: RequestDefinition = {
    method,
    url: path,
  }

  // Headers → equalTo matchers (drop transport/auto headers)
  const headers = extractHeaders(req.header, variables)
  if (headers && Object.keys(headers).length > 0) {
    request.headers = headers
  }

  // Body → bodyPatterns
  const bodyPatterns = extractBody(req.body, variables)
  if (bodyPatterns && bodyPatterns.length > 0) {
    request.bodyPatterns = bodyPatterns
  }

  const response = buildResponse(item.response, variables)

  return {
    name,
    method,
    path,
    folderPath,
    payload: {
      name,
      projectId,
      request,
      response,
      persistent: true,
    },
  }
}

// ── WireMock admin API passthrough ──────────────────────────────
// When a Postman request POSTs a stub mapping to /__admin/mappings, the
// body (not the request URL) is what should become the mock.

interface WireMockMapping {
  name?: string
  request?: Partial<RequestDefinition> & { method?: string }
  response?: Partial<ResponseDefinition> & { status?: number }
  priority?: number
  persistent?: boolean
  metadata?: Record<string, unknown>
}

function tryExtractAdminMapping(
  req: PostmanRequest,
  variables: Map<string, string>,
): WireMockMapping | null {
  const method = (req.method ?? '').toUpperCase()
  if (method !== 'POST' && method !== 'PUT') return null

  const path = extractPath(req.url, variables)
  // Match /__admin/mappings and /__admin/mappings/<id>
  if (!/^\/__admin\/mappings(\/.*)?$/.test(path)) return null

  const rawBody = req.body?.mode === 'raw' ? req.body.raw : undefined
  if (!rawBody) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(substitute(rawBody, variables))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const mapping = parsed as WireMockMapping
  // Minimum shape check — must have a request object with a method.
  if (!mapping.request || typeof mapping.request !== 'object') return null
  if (!mapping.request.method) return null

  return mapping
}

function buildFromAdminMapping(
  mapping: WireMockMapping,
  item: PostmanItem,
  folderPath: string[],
  projectId: string,
): ParsedRequest {
  const method = String(mapping.request?.method ?? 'GET').toUpperCase()
  const request: RequestDefinition = {
    ...(mapping.request as RequestDefinition),
    method,
  }
  const path =
    request.url ?? request.urlPath ?? request.urlPattern ?? request.urlPathPattern ?? '/'

  // Spread the mapping's response first so its fields (headers, body,
  // jsonBody, fixedDelayMilliseconds, etc.) come through, then ensure
  // `status` is set — using the mapping's value when present, 200 otherwise.
  const response: ResponseDefinition = {
    ...(mapping.response as ResponseDefinition),
    status: typeof mapping.response?.status === 'number' ? mapping.response.status : 200,
  }

  // Prefer the mapping's own name, fall back to the Postman item name.
  const baseName =
    (mapping.name && mapping.name.trim()) ||
    (item.name && item.name.trim()) ||
    `${method} ${path}`
  const name =
    folderPath.length === 0 ? baseName : `${folderPath.join(' / ')} / ${baseName}`

  const payload: CreateMockPayload = {
    name,
    projectId,
    request,
    response,
    persistent: mapping.persistent ?? true,
  }
  if (typeof mapping.priority === 'number') payload.priority = mapping.priority
  if (mapping.metadata) payload.metadata = mapping.metadata

  return {
    name,
    method,
    path,
    folderPath,
    payload,
  }
}

// ── URL / path ──────────────────────────────────────────────────

function extractPath(
  url: PostmanUrl | string | undefined,
  variables: Map<string, string>,
): string {
  if (!url) return '/'

  if (typeof url === 'string') {
    return normalizePath(urlPathFromRaw(substitute(url, variables)))
  }

  let rawPath: string | undefined
  if (Array.isArray(url.path) && url.path.length > 0) {
    rawPath = '/' + url.path.map(seg => substitute(String(seg), variables)).join('/')
  } else if (typeof url.path === 'string' && url.path.length > 0) {
    rawPath = substitute(url.path, variables)
  } else if (url.raw) {
    rawPath = urlPathFromRaw(substitute(url.raw, variables))
  }

  return normalizePath(rawPath ?? '/')
}

function urlPathFromRaw(raw: string): string {
  // Strip protocol + host. Keep path + drop query/hash (query handled separately).
  const trimmed = raw.trim()
  if (!trimmed) return '/'
  try {
    const u = new URL(trimmed.startsWith('http') ? trimmed : `http://placeholder${trimmed.startsWith('/') ? '' : '/'}${trimmed}`)
    return u.pathname || '/'
  } catch {
    // Fallback: manually strip query/hash
    const noQuery = trimmed.split('?')[0].split('#')[0]
    const afterScheme = noQuery.replace(/^[a-z]+:\/\//i, '')
    const firstSlash = afterScheme.indexOf('/')
    return firstSlash >= 0 ? afterScheme.slice(firstSlash) : '/'
  }
}

function normalizePath(path: string): string {
  if (!path) return '/'
  let p = path.startsWith('/') ? path : `/${path}`
  // Collapse duplicate slashes
  p = p.replace(/\/{2,}/g, '/')
  // Convert Postman path variables (:id) to a WireMock-compatible placeholder.
  p = p.replace(/:([A-Za-z_][\w-]*)/g, '{$1}')
  return p
}

// ── Headers ─────────────────────────────────────────────────────

function extractHeaders(
  headers: PostmanKV[] | undefined,
  variables: Map<string, string>,
): Record<string, StringMatcher> | undefined {
  if (!Array.isArray(headers) || headers.length === 0) return undefined
  const out: Record<string, StringMatcher> = {}
  for (const h of headers) {
    if (!h || !h.key || h.disabled) continue
    if (SKIP_HEADERS.has(h.key.toLowerCase())) continue
    out[h.key] = { equalTo: substitute(h.value ?? '', variables) }
  }
  return out
}

// ── Body ────────────────────────────────────────────────────────

function extractBody(
  body: PostmanBody | undefined,
  variables: Map<string, string>,
): BodyPattern[] | undefined {
  if (!body || body.mode !== 'raw' || !body.raw) return undefined
  const raw = substitute(body.raw, variables)
  const language = body.options?.raw?.language?.toLowerCase()
  if (language === 'json' || looksLikeJson(raw)) {
    try {
      JSON.parse(raw) // validate
      return [{ equalToJson: raw, ignoreArrayOrder: true, ignoreExtraElements: true }]
    } catch {
      // fall through to plain equalTo
    }
  }
  return [{ equalTo: raw }]
}

function looksLikeJson(s: string): boolean {
  const t = s.trim()
  return t.startsWith('{') || t.startsWith('[')
}

// ── Response ────────────────────────────────────────────────────

function buildResponse(
  examples: PostmanResponse[] | undefined,
  variables: Map<string, string>,
): ResponseDefinition {
  const first = Array.isArray(examples) ? examples[0] : undefined
  const status = typeof first?.code === 'number' ? first.code : 200

  const response: ResponseDefinition = { status }

  // Only copy a small set of useful response headers to keep the mock clean.
  if (Array.isArray(first?.header)) {
    const headers: Record<string, string> = {}
    for (const h of first.header) {
      if (!h || !h.key || h.disabled) continue
      if (h.key.toLowerCase() === 'content-type') {
        headers[h.key] = substitute(h.value ?? '', variables)
      }
    }
    if (Object.keys(headers).length > 0) response.headers = headers
  }

  const body = typeof first?.body === 'string' ? substitute(first.body, variables) : ''
  if (body) {
    if (looksLikeJson(body)) {
      try {
        response.jsonBody = JSON.parse(body)
      } catch {
        response.body = body
      }
    } else {
      response.body = body
    }
  }

  // Ensure there's at least a Content-Type for JSON bodies.
  if (response.jsonBody !== undefined && !response.headers) {
    response.headers = { 'Content-Type': 'application/json' }
  }

  return response
}

// ── Variables ───────────────────────────────────────────────────

function buildVariableMap(vars: PostmanKV[] | undefined): Map<string, string> {
  const map = new Map<string, string>()
  if (!Array.isArray(vars)) return map
  for (const v of vars) {
    if (!v || !v.key || v.disabled) continue
    map.set(v.key, v.value ?? '')
  }
  return map
}

function substitute(input: string, variables: Map<string, string>): string {
  if (!input || variables.size === 0) return input
  return input.replace(/\{\{([^}]+)\}\}/g, (_, rawName) => {
    const name = String(rawName).trim()
    const val = variables.get(name)
    return val !== undefined ? val : `{{${name}}}`
  })
}

// ── Name building ───────────────────────────────────────────────

function buildName(
  itemName: string | undefined,
  folderPath: string[],
  method: string,
  path: string,
): string {
  const base = (itemName && itemName.trim()) || `${method} ${path}`
  if (folderPath.length === 0) return base
  return `${folderPath.join(' / ')} / ${base}`
}
