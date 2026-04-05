export interface KeyValuePair {
  key: string
  value: string
  _customKey?: boolean
}

// ── String Matcher ─────────────────────────────────────────────
// Used for headers, cookies, query parameters
export interface StringMatcher {
  equalTo?: string
  matches?: string
  doesNotMatch?: string
  contains?: string
  absent?: boolean
  caseInsensitive?: boolean
  // JSON matchers
  equalToJson?: string
  ignoreArrayOrder?: boolean
  ignoreExtraElements?: boolean
  matchesJsonPath?: string | { expression: string; [key: string]: unknown }
  // XML matchers
  equalToXml?: string
  enablePlaceholders?: boolean
  matchesXPath?: string | { expression: string; [key: string]: unknown }
  xPathNamespaces?: Record<string, string>
  // Binary
  binaryEqualTo?: string
  // DateTime matchers
  before?: string
  after?: string
  equalToDateTime?: string
  // Truncate the expected/actual datetime to a given precision before
  // comparison. WireMock accepts a small set of string presets like
  // 'first second of minute', 'first hour of day', etc.
  truncateExpected?: string
  truncateActual?: string
  // Offset applied to the expected datetime before comparison —
  // a numeric amount plus a unit (SECONDS, MINUTES, HOURS, DAYS, MONTHS, YEARS).
  expectedOffset?: number
  expectedOffsetUnit?: string
}

// ── Body Pattern ───────────────────────────────────────────────
export interface BodyPattern {
  equalTo?: string
  contains?: string
  matches?: string
  doesNotMatch?: string
  equalToJson?: string | object
  ignoreArrayOrder?: boolean
  ignoreExtraElements?: boolean
  matchesJsonPath?: string | { expression: string; [key: string]: unknown }
  // Validate the body against a JSON Schema. The value carries the
  // schema document itself (or a JSON string thereof). `schemaVersion`
  // is optional and defaults to draft-07 in WireMock.
  matchesJsonSchema?: string | object
  schemaVersion?: string
  equalToXml?: string
  matchesXPath?: string | { expression: string; [key: string]: unknown }
  xPathNamespaces?: Record<string, string>
  binaryEqualTo?: string
  absent?: boolean
  caseInsensitive?: boolean
  enablePlaceholders?: boolean
  // DateTime matcher options (apply to before/after/equalToDateTime
  // when those are used as body matchers — same shape as on
  // StringMatcher).
  before?: string
  after?: string
  equalToDateTime?: string
  truncateExpected?: string
  truncateActual?: string
  expectedOffset?: number
  expectedOffsetUnit?: string
}

// ── Basic Auth ─────────────────────────────────────────────────
export interface BasicAuthCredentials {
  username: string
  password: string
}

// ── Custom Matcher ─────────────────────────────────────────────
export interface CustomMatcher {
  name: string
  parameters?: Record<string, unknown>
}

// ── Request Definition ─────────────────────────────────────────
export interface RequestDefinition {
  method: string
  // URL matching (use exactly one)
  url?: string
  urlPath?: string
  urlPattern?: string
  urlPathPattern?: string
  // Headers & Cookies
  headers?: Record<string, StringMatcher>
  cookies?: Record<string, StringMatcher>
  // Query parameters
  queryParameters?: Record<string, StringMatcher>
  // Body
  bodyPatterns?: BodyPattern[]
  // Basic auth
  basicAuthCredentials?: BasicAuthCredentials
  // Custom matcher
  customMatcher?: CustomMatcher
}

// ── Delay Distribution ─────────────────────────────────────────
export interface DelayDistribution {
  type: 'uniform' | 'lognormal' | 'fixed'
  lower?: number
  upper?: number
  median?: number
  sigma?: number
  milliseconds?: number
}

// ── Chunked Dribble Delay ──────────────────────────────────────
export interface ChunkedDribbleDelay {
  numberOfChunks: number
  totalDuration: number
}

// ── Webhook ────────────────────────────────────────────────────
export interface WebhookDefinition {
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
  delay?: { type: string; milliseconds: number }
}

// ── Serve Event Listener ───────────────────────────────────────
export interface ServeEventListener {
  name: string
  parameters: Record<string, unknown>
}

// ── Response Definition ────────────────────────────────────────
export interface ResponseDefinition {
  status: number
  statusMessage?: string
  headers?: Record<string, string | string[]>

  // Body (use exactly one)
  body?: string
  jsonBody?: unknown
  base64Body?: string
  bodyFileName?: string
  // Delays
  fixedDelayMilliseconds?: number
  delayDistribution?: DelayDistribution
  chunkedDribbleDelay?: ChunkedDribbleDelay
  // Fault simulation
  fault?: 'EMPTY_RESPONSE' | 'MALFORMED_RESPONSE_CHUNK' | 'RANDOM_DATA_THEN_CLOSE' | 'CONNECTION_RESET_BY_PEER'
  // Proxying
  proxyBaseUrl?: string
  additionalProxyRequestHeaders?: Record<string, string>
  removeProxyRequestHeaders?: string[]
  // Transformers
  transformers?: string[]
  transformerParameters?: Record<string, unknown>
}

// ── Metadata ───────────────────────────────────────────────────
export type StubMetadata = Record<string, unknown>

// ── Create / Update Payload ────────────────────────────────────
export interface CreateMockPayload {
  name: string
  description?: string
  projectId: string
  request: RequestDefinition
  response: ResponseDefinition
  persistent: boolean
  // Top-level optional properties
  priority?: number
  // When true, requests served by this stub are NOT written to the
  // request journal. Useful for high-volume "noise" stubs that would
  // otherwise drown out the entries the user actually cares about.
  doNotRecordRequest?: boolean
  metadata?: StubMetadata
  serveEventListeners?: ServeEventListener[]
  curl?: string
}

// ── Mock Response (from API) ───────────────────────────────────
export interface MockResponse {
  id: string
  name: string
  description?: string
  projectId: string
  request: RequestDefinition
  response: ResponseDefinition
  persistent: boolean
  priority?: number
  doNotRecordRequest?: boolean
  metadata?: StubMetadata
  serveEventListeners?: ServeEventListener[]
  postServeActions?: {
    webhook?: WebhookDefinition
  }
  curl?: string
  createdAt: string
  updatedAt: string
}

export interface CloneMockRequest {
  name: string
}

export interface MoveMockRequest {
  targetProjectId: string
}
