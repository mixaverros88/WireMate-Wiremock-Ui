// Types for the WireMock /__admin/near-misses response.
// Kept separate from the view so other services/views can reuse them.

export interface NearMissEntry {
  request: {
    url: string
    method: string
    absoluteUrl?: string
    headers?: Record<string, string>
  }
  stubMapping?: {
    id: string
    name?: string
    request: {
      method?: string
      url?: string
      urlPath?: string
      urlPattern?: string
      urlPathPattern?: string
    }
  }
  matchResult?: {
    distance: number
  }
  requestPattern?: Record<string, unknown>
}

export interface NearMissesResponse {
  nearMisses: NearMissEntry[]
}
