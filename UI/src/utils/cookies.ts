// ── Cookie helpers ───────────────────────────────────────────
// Self-contained cookie utilities shared by the Create/Edit Mock form.
// No Vue imports — this module is framework-agnostic so it can be unit-
// tested and reused (e.g. from the Postman importer/exporter, or any
// future tooling that needs to read/emit Set-Cookie headers).
//
// A `CookieRow` represents one of two conceptually different things:
//   • Request-side ('request'): a matcher WireMock runs against the
//     incoming `Cookie` header. Only `key`, `value`, and `matcherType`
//     matter here — browsers never transmit Domain/Path/Secure/etc. on
//     requests, so the attribute fields are ignored in this mode.
//   • Response-side ('response'): a `Set-Cookie` header the stub emits
//     on the outgoing response. Here all browser attributes
//     (Domain, Path, Expires, Max-Age, Secure, HttpOnly, SameSite) are
//     meaningful, and `matcherType` is ignored.
// We keep both variants in a single row type rather than two separate
// ones so the UI can render a homogeneous list.

export interface CookieRow {
  direction: 'request' | 'response'
  key: string
  value: string
  // Request-only: which WireMock matcher to apply to the cookie value.
  // Ignored when direction === 'response'.
  matcherType: string
  // Request-only: when true, the matcher does a case-insensitive
  // comparison. WireMock honours this on equalTo/contains/matches/
  // doesNotMatch only — for `absent` it's silently ignored.
  caseInsensitive: boolean
  // Response-only: browser cookie attributes — all optional.
  // Ignored when direction === 'request'.
  domain: string
  path: string
  expires: string
  maxAge: string
  secure: boolean
  httpOnly: boolean
  sameSite: '' | 'Strict' | 'Lax' | 'None'
}

// Legacy metadata key — no longer written, but still filtered out of
// the Metadata UI for mocks saved before the response-side cookie flip.
// The browser attributes now round-trip inside the `Set-Cookie` header
// string itself, so we don't need a sidecar blob.
export const COOKIE_ATTRS_METADATA_KEY = '_cookieAttributes'

export function createCookieRow(overrides: Partial<CookieRow> = {}): CookieRow {
  return {
    // Default to 'response' because that's the more common stubbing
    // case (session cookies, auth cookies, CSRF tokens, etc.). Callers
    // that want a request matcher pass `direction: 'request'`.
    direction: 'response',
    key: '',
    value: '',
    matcherType: 'equalTo',
    caseInsensitive: false,
    domain: '',
    path: '',
    expires: '',
    maxAge: '',
    secure: false,
    httpOnly: false,
    sameSite: '',
    ...overrides,
  }
}

// Coerce a cookie-attribute value to a trimmed string without exploding
// on non-string inputs. The CookieRow interface types every text
// attribute as string, but in practice they can arrive as numbers in
// two ways:
//   1) <input type="number"> with v-model sometimes returns a number in
//      certain browsers / Vue build configurations.
//   2) A mock saved with `maxAge: 3600` round-trips through JSON as a
//      number when re-loaded for edit. If the populate code path is
//      ever extended without coercing, we still want downstream checks
//      to be safe.
// Treating null/undefined as empty also means brand-new rows that were
// partially seeded (via spread of a Partial<CookieRow>) won't throw.
export function cookieStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return typeof v === 'string' ? v.trim() : String(v).trim()
}

// ── Cookie attribute validators ───────────────────────────────
// These validators are lenient on purpose — browsers themselves accept
// a wide range of shapes (and real-world servers emit odder ones). We
// reject only the clearly-broken cases. Empty means "attribute omitted"
// → valid.

// RFC 6265 domain-attribute shape, plus two practical accommodations:
//   • a leading `.` is tolerated (legacy, common in the wild)
//   • the bare host `localhost` is accepted (common in dev stubs)
// Each label: letters/digits/hyphens, no leading/trailing hyphen,
// 1–63 chars.
export function isValidCookieDomain(d: string): boolean {
  const trimmed = cookieStr(d)
  if (!trimmed) return true
  const host = trimmed.replace(/^\./, '')
  if (!host) return false
  if (host === 'localhost') return true
  // Reject spaces, protocol prefixes, and ports outright — none belong
  // here.
  if (/[\s/:]/.test(host)) return false
  const labelRe = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/
  return host.split('.').every(label => labelRe.test(label))
}

// Cookie `Path` attribute: must start with `/`, no whitespace, no `?`
// or `#` (those belong to the URL's query / fragment, not the path the
// cookie applies to). A bare `/` is fine — matches every request on
// the origin.
export function isValidCookiePath(p: string): boolean {
  const trimmed = cookieStr(p)
  if (!trimmed) return true
  return /^\/[^\s?#]*$/.test(trimmed)
}

// Convert a datetime-local-shaped string (`YYYY-MM-DDTHH:MM` or with
// seconds) into an RFC 7231 HTTP-date suitable for a Set-Cookie
// `Expires` attribute. Falls back to the raw string on parse failure so
// hand-typed HTTP dates still round-trip.
export function toHttpDate(isoLocal: string): string {
  const d = new Date(isoLocal)
  return Number.isNaN(d.getTime()) ? isoLocal : d.toUTCString()
}

// Inverse of `toHttpDate`. `<input type="datetime-local">` expects a
// `YYYY-MM-DDTHH:MM` string in *local* time; HTTP dates are in GMT, so
// we reformat the Date in the browser's local zone before handing it
// back.
export function fromHttpDate(raw: string): string {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Serialize a cookie row to the value of a `Set-Cookie` response
// header. Format per RFC 6265: `name=value; Attr=Val; Flag; ...`
// Returns an empty string when the cookie has no name — callers should
// skip.
export function cookieToSetCookieString(c: CookieRow): string {
  const name = cookieStr(c.key)
  if (!name) return ''
  // Value may be empty (e.g. logout cookie `sessionid=`); still emit it.
  const parts = [`${name}=${cookieStr(c.value)}`]
  const domain = cookieStr(c.domain)
  if (domain) parts.push(`Domain=${domain}`)
  const path = cookieStr(c.path)
  if (path) parts.push(`Path=${path}`)
  // The UI stores Expires as a datetime-local string
  // (`YYYY-MM-DDTHH:MM`) because that's what the native calendar picker
  // emits. Set-Cookie expects an RFC 7231 HTTP-date — convert here.
  // Hand-typed HTTP dates that fail parsing fall through verbatim.
  const expires = cookieStr(c.expires)
  if (expires) parts.push(`Expires=${toHttpDate(expires)}`)
  const maxAge = cookieStr(c.maxAge)
  if (maxAge && Number.isFinite(Number(maxAge))) parts.push(`Max-Age=${Number(maxAge)}`)
  if (c.secure) parts.push('Secure')
  if (c.httpOnly) parts.push('HttpOnly')
  if (c.sameSite) parts.push(`SameSite=${c.sameSite}`)
  return parts.join('; ')
}

// Parse a single `Set-Cookie` header value back into a CookieRow.
// Tolerant of missing pieces and case-insensitive on attribute names,
// since real-world cookies from imported stubs arrive in all kinds of
// shapes.
export function parseSetCookieString(raw: string): CookieRow | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  const segments = trimmed.split(';').map(s => s.trim()).filter(Boolean)
  if (segments.length === 0) return null
  // First segment is name=value (value may itself contain '=', so only
  // split on the first one).
  const first = segments[0]
  const eqIdx = first.indexOf('=')
  if (eqIdx === -1) return null
  const row = createCookieRow({
    key: first.slice(0, eqIdx).trim(),
    value: first.slice(eqIdx + 1).trim(),
  })
  if (!row.key) return null
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    const sepIdx = seg.indexOf('=')
    const name = (sepIdx === -1 ? seg : seg.slice(0, sepIdx)).trim().toLowerCase()
    const value = sepIdx === -1 ? '' : seg.slice(sepIdx + 1).trim()
    switch (name) {
      case 'domain':   row.domain = value; break
      case 'path':     row.path = value; break
      // Stored Expires comes in as RFC 7231 HTTP-date; rewrite into the
      // `YYYY-MM-DDTHH:MM` shape the datetime-local input expects so
      // the picker renders the right moment. Unparseable values fall
      // through.
      case 'expires':  row.expires = fromHttpDate(value); break
      case 'max-age':  row.maxAge = value; break
      case 'secure':   row.secure = true; break
      case 'httponly': row.httpOnly = true; break
      case 'samesite': {
        const v = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
        if (v === 'Strict' || v === 'Lax' || v === 'None') row.sameSite = v
        break
      }
    }
  }
  return row
}
