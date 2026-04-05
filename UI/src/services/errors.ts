/**
 * Standardized error parsing for the WireMate Spring Boot backoffice.
 *
 * The backend's @ControllerAdvice serializes validation / business errors as
 * a Problem-Detail-style JSON body, e.g. on a 400:
 *
 *   {
 *     "title":    "Bad Request",
 *     "status":   400,
 *     "detail":   "Project with name: SFMC Mock (copy) (copy) already exists",
 *     "instance": "/api/projects/3de1fa22-.../clone"
 *   }
 *
 * For UI toasts we want to surface `detail` directly to the user rather than
 * a generic "Request failed" message. These helpers read a non-OK Response
 * and produce the best available human-readable string from it.
 *
 * The body is read as text first so we can defensively try-parse it as JSON;
 * an empty body, an HTML error page from a proxy, or a plain-text 5xx all
 * fall through cleanly to the caller-supplied fallback.
 */

interface ProblemDetailLike {
  detail?: unknown
  message?: unknown
  error?: unknown
  title?: unknown
}

/**
 * Error thrown for any non-OK backend response. Carries the HTTP `status`
 * alongside the human-readable `message` so callers that need to branch on
 * the status code (e.g. distinguishing a 404 "not found" from a generic
 * failure) can, while existing `catch (e) { toast(e.message) }` handlers keep
 * working unchanged because it extends `Error`.
 */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Best-effort extraction of a user-facing error message from a non-OK
 * Response. Returns `fallback` when nothing useful can be parsed.
 */
export async function extractApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  let body = ''
  try {
    body = await response.text()
  } catch {
    return fallback
  }

  if (!body) return fallback

  try {
    const parsed = JSON.parse(body) as ProblemDetailLike
    // Preferred field - RFC 7807 / Spring's ProblemDetail.
    if (typeof parsed.detail === 'string' && parsed.detail.trim()) {
      return parsed.detail
    }
    // Legacy shapes some endpoints still emit.
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message
    }
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error
    }
    if (typeof parsed.title === 'string' && parsed.title.trim()) {
      return parsed.title
    }
  } catch {
    // Body wasn't JSON (e.g. an upstream proxy HTML page) - return the raw
    // text below; it's still more useful than a generic status string.
  }

  return body
}

/**
 * Convenience wrapper: read the error body, then throw `new Error(message)`.
 * Use after `if (!response.ok)` so backend `detail` text bubbles straight
 * up to the UI's catch-and-toast handler.
 */
export async function throwApiError(
  response: Response,
  fallback: string,
): Promise<never> {
  const message = await extractApiErrorMessage(response, fallback)
  throw new ApiError(message, response.status)
}
