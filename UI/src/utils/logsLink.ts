// Builds the deep-link query for the Logs (request journal) view from a
// mock/stub request matcher.
//
// The important part is preserving WHICH url matcher the request used and
// passing it through as `urlMatch`, so the Logs page applies the SAME
// matcher rather than a generic `contains` substring. A regex matcher such
// as `urlPattern: "/api/orders/[0-9]+"` would never match real logged URLs
// as a literal substring — it has to be re-applied as a regex on the Logs
// side to find the requests this mock/stub actually served.

export interface UrlMatchable {
  url?: string
  urlPath?: string
  urlPattern?: string
  urlPathPattern?: string
}

export type UrlMatch = 'url' | 'urlPath' | 'urlPattern' | 'urlPathPattern'

export interface LogsLinkQuery {
  search: string
  urlMatch?: UrlMatch
}

// Maps the populated matcher field to its `urlMatch` token. Field
// precedence mirrors the display helpers used across the app
// (url → urlPath → urlPattern → urlPathPattern). When none is set the
// caller's fallback (e.g. the mock/stub name) is used with no urlMatch,
// which the Logs page treats as a plain `contains` search.
export function logsLinkQuery(
  req: UrlMatchable | null | undefined,
  fallbackSearch = '',
): LogsLinkQuery {
  if (req?.url) return { search: req.url, urlMatch: 'url' }
  if (req?.urlPath) return { search: req.urlPath, urlMatch: 'urlPath' }
  if (req?.urlPattern) return { search: req.urlPattern, urlMatch: 'urlPattern' }
  if (req?.urlPathPattern) return { search: req.urlPathPattern, urlMatch: 'urlPathPattern' }
  return { search: fallbackSearch }
}

// Convenience that returns the router `query` object directly. `urlMatch`
// is omitted when there's no concrete matcher ('contains' is the Logs
// page default).
export function logsLinkRouteQuery(
  req: UrlMatchable | null | undefined,
  fallbackSearch = '',
): Record<string, string> {
  const { search, urlMatch } = logsLinkQuery(req, fallbackSearch)
  const query: Record<string, string> = { search }
  if (urlMatch) query.urlMatch = urlMatch
  return query
}
