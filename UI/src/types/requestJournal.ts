export interface LoggedRequestHeader {
  [key: string]: string
}

export interface QueryParam {
  key?: string
  values: string[]
}

export interface LoggedRequestDetail {
  url: string
  absoluteUrl: string
  method: string
  clientIp: string
  headers: LoggedRequestHeader
  cookies: Record<string, string>
  browserProxyRequest: boolean
  loggedDate: string | number
  bodyAsBase64: string
  body: string
  protocol: string
  scheme: string
  host: string
  port: number
  loggedDateString: string
  queryParams?: Record<string, QueryParam>
  formParams?: Record<string, QueryParam | string[] | string>
}

export interface LoggedResponseDetail {
  status: number
  headers: LoggedRequestHeader
  body?: string
  bodyAsBase64?: string
}

export interface StubMappingRequestPattern {
  method?: string
  url?: string
  urlPath?: string
  urlPattern?: string
  urlPathPattern?: string
  headers?: Record<string, unknown>
  queryParameters?: Record<string, unknown>
  cookies?: Record<string, unknown>
  bodyPatterns?: unknown[]
}

export interface StubMappingResponseDefinition {
  status: number
  statusMessage?: string
  headers?: Record<string, string>
  body?: string
  jsonBody?: unknown
  base64Body?: string
  bodyFileName?: string
  fixedDelayMilliseconds?: number
}

export interface StubMapping {
  id: string
  uuid?: string
  name?: string
  persistent?: boolean
  priority?: number
  metadata?: Record<string, unknown>
  request?: StubMappingRequestPattern
  response?: StubMappingResponseDefinition
}

export interface RequestTiming {
  addedDelay?: number
  processTime?: number
  responseSendTime?: number
  serveTime?: number
  totalTime?: number
}

export interface LoggedRequest {
  id: string
  request: LoggedRequestDetail
  response?: LoggedResponseDetail
  responseDefinition?: LoggedResponseDetail
  stubMapping?: StubMapping
  subEvents?: unknown[]
  timing?: RequestTiming
  wasMatched?: boolean
}

export interface RequestJournalResponse {
  requests: LoggedRequest[]
  meta: {
    total: number
  }
  requestJournalDisabled: boolean
}

export interface RequestPattern {
  method?: string
  url?: string
  urlPattern?: string
  urlPathPattern?: string
  urlPath?: string
  headers?: Record<string, { equalTo?: string; matches?: string; contains?: string }>
  queryParameters?: Record<string, { equalTo?: string; matches?: string; contains?: string }>
  cookies?: Record<string, { equalTo?: string; matches?: string; contains?: string }>
  bodyPatterns?: Array<{
    equalTo?: string
    contains?: string
    matches?: string
    equalToJson?: string | object
    matchesJsonPath?: string
    ignoreArrayOrder?: boolean
    ignoreExtraElements?: boolean
  }>
}
