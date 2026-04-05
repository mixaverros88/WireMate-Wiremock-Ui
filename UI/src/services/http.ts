/**
 * Shared HTTP helpers used by every service module.
 *
 * Goals:
 *   1. One place that decides what an error looks like (delegates to
 *      `errors.ts` so ProblemDetail's `detail` field surfaces as the
 *      toast message, falling back through `message`/`error`/`title`).
 *   2. One place that handles "the response body is empty" (204, or
 *      `Content-Length: 0`) so callers don't trip over
 *      `Unexpected end of JSON input` in production.
 *   3. One place that defaults `Content-Type: application/json` — the
 *      WireMock admin port is strict about it on POST/PUT bodies, and
 *      forgetting to set it was a recurring source of 415s.
 *
 * History: previously `api.ts`, `settingsService.ts`, `stubService.ts`
 * and `requestJournalService.ts` each grew their own `request<T>`
 * helpers with slightly different error parsing, which meant the
 * quality of toast messages varied by which service you hit. This
 * module is the single source of truth.
 */

import { throwApiError } from './errors'

export interface RequestOptions extends RequestInit {
  /**
   * When true, attempt to parse the response body as JSON. Defaults to
   * true. Endpoints that legitimately return an empty body (204, or a
   * 200 with `Content-Length: 0`) will resolve to `undefined` no matter
   * what this is set to — see the body-handling block below.
   */
  parseJson?: boolean
  /**
   * Override the fallback error message used when the backend returns a
   * non-OK response with no parseable error payload.
   */
  errorFallback?: string
}

/**
 * Fetch wrapper that:
 *   • Adds `Content-Type: application/json` unless the caller already
 *     supplied one (or explicitly set the header to undefined).
 *   • Throws an `Error` whose message is the backend's ProblemDetail
 *     `detail` text on any non-OK status.
 *   • Returns `undefined as T` on 204 / empty body, so callers that
 *     don't care about the response value get a sane value without
 *     parsing-error surprises.
 *
 * Use the full URL (including the base) — this helper doesn't compose
 * paths, because different services target different backends
 * (WireMate API vs. WireMock admin port).
 */
export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { parseJson = true, errorFallback, ...init } = options
  const headers = new Headers(init.headers ?? {})
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(url, { ...init, headers })
  } catch (e) {
    // A rejected fetch (vs. a non-OK Response) means the request never got
    // an HTTP reply: the host is down/unreachable, DNS failed, or — most
    // commonly in this app — the browser blocked it on CORS preflight.
    // Browsers surface all of these as an opaque `TypeError: Failed to
    // fetch`, which tells the user nothing. Rethrow with the target host
    // and the likely causes so the toast is actionable.
    if (e instanceof TypeError) {
      let host = url
      try { host = new URL(url).host } catch { /* keep full url if unparseable */ }
      throw new Error(
        `Couldn't reach ${host}. The server may be down, or the request was `
        + `blocked by CORS (check the backend's allowed origins and that the UI `
        + `is on an allowed port).`,
      )
    }
    throw e
  }

  if (!response.ok) {
    await throwApiError(response, errorFallback ?? `Request failed with status ${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  // Some endpoints (e.g. POST /mocks/{id}/republish) legitimately return
  // an empty body with a 200 status. Reading as text first lets us
  // return cleanly instead of throwing "Unexpected end of JSON input".
  const text = await response.text()
  if (!text) {
    return undefined as T
  }

  if (!parseJson) {
    return text as unknown as T
  }

  try {
    return JSON.parse(text) as T
  } catch (e) {
    throw new Error(
      `Invalid JSON response from ${url}: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
}

/**
 * Convenience wrapper for endpoints that don't return a body (or whose
 * body the caller intentionally discards). Behaves like `request<void>`
 * but the type is clearer at the call site.
 */
export async function requestNoBody(url: string, options: RequestOptions = {}): Promise<void> {
  await request<void>(url, options)
}
