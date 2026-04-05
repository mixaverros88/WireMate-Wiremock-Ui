/**
 * Pure validation helpers extracted from CreateMock.vue's
 * `validationIssues` mega-computed.
 *
 * Why this exists
 * ---------------
 * The original computed was 217 lines long, mixed every section's rules
 * together, and was untestable without rendering the whole form. Each
 * validator here is a pure function that maps form-state into
 * `ValidationIssue[]`. CreateMock's inline computed still aggregates
 * them, but the individual rules can now be unit-tested in isolation.
 *
 * Scope
 * -----
 * Only the SELF-CONTAINED sections are extracted (Basic Auth,
 * Webhook URL, Proxy URL, Chunked Dribble, Uniform Delay, Cookie
 * Domain/Path). Sections that depend on a thicket of in-component
 * helpers (metadata validation, body-pattern combinations, JSON parse
 * checks on transformer parameters, etc.) stay inline for now — a
 * later pass can move them out as the helpers themselves migrate to
 * utils modules.
 *
 * Each validator takes the smallest object literal that can answer the
 * rules — no Vue refs, no closures over component state. That's what
 * makes them testable: pass a plain `{}` and assert on the returned
 * array.
 */

import { isValidAbsoluteUrl } from 'mgv-backoffice'
import {
  cookieStr,
  isValidCookieDomain,
  isValidCookiePath,
  type CookieRow,
} from '../utils/cookies'

export interface ValidationIssue {
  section: string
  message: string
}

// ── URL helpers ────────────────────────────────────────────────────

// isValidAbsoluteUrl migrated to mgv-backoffice (v1.34.0). Re-exported
// here so existing imports keep working; new code should import it from
// 'mgv-backoffice' directly.
export { isValidAbsoluteUrl }

// ── Section validators ─────────────────────────────────────────────

export function validateBasicAuth(input: {
  enabled: boolean
  username: string
  password: string
}): ValidationIssue[] {
  if (!input.enabled) return []
  const issues: ValidationIssue[] = []
  if (!input.username.trim()) {
    issues.push({
      section: 'Basic Authentication',
      message: 'Username is required when Basic Auth matching is enabled.',
    })
  }
  if (!input.password.trim()) {
    issues.push({
      section: 'Basic Authentication',
      message: 'Password is required when Basic Auth matching is enabled.',
    })
  }
  return issues
}

export function validateWebhookUrl(input: {
  enabled: boolean
  url: string
}): ValidationIssue[] {
  if (!input.enabled) return []
  const trimmed = input.url.trim()
  if (!trimmed) {
    return [{ section: 'Webhooks', message: 'URL is required when a webhook is enabled.' }]
  }
  if (!isValidAbsoluteUrl(trimmed)) {
    return [{
      section: 'Webhooks',
      message: 'URL must be an absolute http:// or https:// address.',
    }]
  }
  return []
}

export function validateProxyUrl(input: {
  enabled: boolean
  url: string
}): ValidationIssue[] {
  if (!input.enabled) return []
  const trimmed = input.url.trim()
  if (!trimmed) {
    return [{ section: 'Proxying', message: 'Base URL is required when proxying is enabled.' }]
  }
  if (!isValidAbsoluteUrl(trimmed)) {
    return [{
      section: 'Proxying',
      message: 'Base URL must be an absolute http:// or https:// address.',
    }]
  }
  return []
}

export function validateChunkedDribble(input: {
  faultEnabled: boolean
  dribbleEnabled: boolean
  numberOfChunks: number | string | null
  totalDuration: number | string | null
}): ValidationIssue[] {
  // Chunked Dribble is bypassed when fault is on — WireMock ignores
  // delays in that case, so reporting an error here would block saves
  // over fields the server will never read.
  if (input.faultEnabled || !input.dribbleEnabled) return []
  const issues: ValidationIssue[] = []
  if (typeof input.numberOfChunks !== 'number' || input.numberOfChunks < 1) {
    issues.push({
      section: 'Chunked Dribble Delay',
      message: 'Number of chunks must be at least 1.',
    })
  }
  if (typeof input.totalDuration !== 'number' || input.totalDuration < 1) {
    issues.push({
      section: 'Chunked Dribble Delay',
      message: 'Total duration must be at least 1 ms.',
    })
  }
  return issues
}

export function validateUniformDelay(input: {
  faultEnabled: boolean
  delayEnabled: boolean
  delayType: string
  lower: number | string | null
  upper: number | string | null
}): ValidationIssue[] {
  if (input.faultEnabled || !input.delayEnabled || input.delayType !== 'uniform') return []
  const issues: ValidationIssue[] = []
  if (typeof input.lower !== 'number' || input.lower < 0) {
    issues.push({
      section: 'Response Delay',
      message: 'Lower bound must be a non-negative number.',
    })
  }
  if (typeof input.upper !== 'number' || input.upper < 0) {
    issues.push({
      section: 'Response Delay',
      message: 'Upper bound must be a non-negative number.',
    })
  }
  if (
    typeof input.lower === 'number' &&
    typeof input.upper === 'number' &&
    input.lower > input.upper
  ) {
    issues.push({
      section: 'Response Delay',
      message: 'Lower bound cannot be greater than upper bound.',
    })
  }
  return issues
}

/**
 * Validate Domain / Path attributes on response-side cookies. Only
 * response cookies have these attributes — request matchers don't.
 */
export function validateCookieAttributes(cookies: CookieRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const badDomain = cookies.filter(
    c => c.direction === 'response' && cookieStr(c.domain) && !isValidCookieDomain(c.domain),
  )
  if (badDomain.length > 0) {
    const names = badDomain.map(c => cookieStr(c.key) || '(unnamed)').join(', ')
    issues.push({
      section: 'Cookies',
      message:
        `Invalid Domain attribute (check: ${names}). Use a hostname like example.com `
        + 'or a leading-dot form like .example.com.',
    })
  }
  const badPath = cookies.filter(
    c => c.direction === 'response' && cookieStr(c.path) && !isValidCookiePath(c.path),
  )
  if (badPath.length > 0) {
    const names = badPath.map(c => cookieStr(c.key) || '(unnamed)').join(', ')
    issues.push({
      section: 'Cookies',
      message:
        `Invalid Path attribute (check: ${names}). Paths must start with "/" and contain `
        + 'no whitespace, "?" or "#".',
    })
  }
  return issues
}
