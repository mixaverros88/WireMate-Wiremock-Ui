import type { Notification, NotificationPage } from '../types/notification'
import { API_URL } from '../config'
import { extractApiErrorMessage, throwApiError } from './errors'

const BASE_URL = `${API_URL}/backoffice`

/** Default page size - keeps the payload bounded so the renderer never hangs on large datasets. */
export const DEFAULT_PAGE_SIZE = 50
/** Client-side timeout - if the backend can't return within this window we surface an actionable error. */
const REQUEST_TIMEOUT_MS = 15_000

export interface FetchNotificationsParams {
  limit?: number
  offset?: number
  signal?: AbortSignal
}

/**
 * Fetch a single page of notifications. Uses an internal AbortController so a stuck
 * backend surfaces a timeout error instead of an indefinite spinner.
 */
export async function fetchNotificationsPage(
  { limit = DEFAULT_PAGE_SIZE, offset = 0, signal }: FetchNotificationsParams = {},
): Promise<NotificationPage> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  // Chain the caller's signal (if any) into our controller so either can abort.
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    const response = await fetch(`${BASE_URL}/notifications?${params.toString()}`, {
      signal: controller.signal,
    })
    if (!response.ok) {
      const message = await extractApiErrorMessage(
        response,
        `Failed to fetch notifications (HTTP ${response.status})`,
      )
      throw new Error(message)
    }

    const data = (await response.json()) as unknown
    return normalizeNotificationResponse(data, limit, offset)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `Notifications request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. The server may be overloaded.`,
      )
    }
    throw err
  } finally {
    window.clearTimeout(timeoutId)
  }
}

/**
 * DELETE /backoffice/notifications/{id} - Remove a single notification by id.
 * Used by the per-card trash icon on the Notifications page.
 */
export async function deleteNotification(id: number | string): Promise<void> {
  const response = await fetch(
    `${BASE_URL}/notifications/${encodeURIComponent(String(id))}`,
    { method: 'DELETE' },
  )
  if (!response.ok) {
    await throwApiError(response, `Failed to delete notification (HTTP ${response.status})`)
  }
}

/**
 * DELETE /backoffice/notifications - Wipe all notifications.
 * Used by the "Delete All" button in the Notifications page header.
 */
export async function deleteAllNotifications(): Promise<void> {
  const response = await fetch(`${BASE_URL}/notifications`, { method: 'DELETE' })
  if (!response.ok) {
    await throwApiError(response, `Failed to delete all notifications (HTTP ${response.status})`)
  }
}

/**
 * Accepts several historically-used backend response shapes and returns a
 * stable `NotificationPage`. Exported for unit testing only.
 */
export function normalizeNotificationResponse(
  data: unknown,
  fallbackLimit: number,
  fallbackOffset: number,
): NotificationPage {
  if (Array.isArray(data)) {
    return {
      items: data as Notification[],
      total: data.length,
      limit: fallbackLimit,
      offset: fallbackOffset,
    }
  }

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>

    if (Array.isArray(obj.items)) {
      return {
        items: obj.items as Notification[],
        total: typeof obj.total === 'number' ? obj.total : (obj.items as Notification[]).length,
        limit: typeof obj.limit === 'number' && obj.limit > 0 ? obj.limit : fallbackLimit,
        offset: typeof obj.offset === 'number' ? obj.offset : fallbackOffset,
      }
    }

    if (Array.isArray(obj.content)) {
      const size = typeof obj.size === 'number' && obj.size > 0 ? obj.size : fallbackLimit
      const page = typeof obj.number === 'number' ? obj.number : 0
      return {
        items: obj.content as Notification[],
        total:
          typeof obj.totalElements === 'number'
            ? obj.totalElements
            : (obj.content as Notification[]).length,
        limit: size,
        offset: page * size,
      }
    }
  }

  return { items: [], total: 0, limit: fallbackLimit, offset: fallbackOffset }
}
