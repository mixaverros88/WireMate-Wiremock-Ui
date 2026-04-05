/**
 * Sample Vitest suite for src/utils/cookies.ts.
 *
 * Picked as the seed test because cookies.ts is a pure, framework-free
 * module with non-trivial logic (RFC 7231 date conversion, domain/path
 * validators, Set-Cookie round-trip). A successful run here proves the
 * Vitest pipeline — Vue SFC plugin, TS resolution, jsdom env — is wired
 * correctly without dragging in any component scaffolding.
 *
 * Run with:  npm test
 */

import { describe, expect, it } from 'vitest'
import {
  cookieStr,
  cookieToSetCookieString,
  createCookieRow,
  fromHttpDate,
  isValidCookieDomain,
  isValidCookiePath,
  parseSetCookieString,
  toHttpDate,
} from './cookies'

describe('cookieStr', () => {
  it('returns an empty string for null and undefined', () => {
    expect(cookieStr(null)).toBe('')
    expect(cookieStr(undefined)).toBe('')
  })

  it('trims string input', () => {
    expect(cookieStr('  hello  ')).toBe('hello')
  })

  it('stringifies non-string input', () => {
    expect(cookieStr(42)).toBe('42')
    expect(cookieStr(true)).toBe('true')
  })
})

describe('isValidCookieDomain', () => {
  it('accepts empty (omitted attribute)', () => {
    expect(isValidCookieDomain('')).toBe(true)
  })

  it('accepts plain hosts and leading-dot variants', () => {
    expect(isValidCookieDomain('example.com')).toBe(true)
    expect(isValidCookieDomain('.example.com')).toBe(true)
    expect(isValidCookieDomain('sub.example.com')).toBe(true)
  })

  it('accepts localhost', () => {
    expect(isValidCookieDomain('localhost')).toBe(true)
  })

  it('rejects schemes, ports, and whitespace', () => {
    expect(isValidCookieDomain('https://example.com')).toBe(false)
    expect(isValidCookieDomain('example.com:8080')).toBe(false)
    expect(isValidCookieDomain('foo bar')).toBe(false)
  })
})

describe('isValidCookiePath', () => {
  it('accepts empty (omitted attribute)', () => {
    expect(isValidCookiePath('')).toBe(true)
  })

  it('requires a leading slash', () => {
    expect(isValidCookiePath('/')).toBe(true)
    expect(isValidCookiePath('/account/settings')).toBe(true)
    expect(isValidCookiePath('account/settings')).toBe(false)
  })

  it('rejects whitespace, ? and # (those belong to the URL not the path)', () => {
    expect(isValidCookiePath('/foo?bar')).toBe(false)
    expect(isValidCookiePath('/foo#bar')).toBe(false)
    expect(isValidCookiePath('/foo bar')).toBe(false)
  })
})

describe('toHttpDate / fromHttpDate', () => {
  it('round-trips a datetime-local string through an HTTP-date', () => {
    const local = '2026-05-14T10:30'
    const http = toHttpDate(local)
    expect(http).toMatch(/GMT$/)
    // Round-trip back; minutes must survive.
    const back = fromHttpDate(http)
    expect(back).toMatch(/^2026-05-14T\d{2}:30$/)
  })

  it('falls back to the raw string on parse failure', () => {
    expect(toHttpDate('not-a-date')).toBe('not-a-date')
    expect(fromHttpDate('not-a-date')).toBe('not-a-date')
  })
})

describe('cookieToSetCookieString', () => {
  it('emits a minimal name=value cookie', () => {
    const row = createCookieRow({ key: 'sid', value: 'abc' })
    expect(cookieToSetCookieString(row)).toBe('sid=abc')
  })

  it('returns an empty string when name is missing', () => {
    const row = createCookieRow({ key: '', value: 'orphan' })
    expect(cookieToSetCookieString(row)).toBe('')
  })

  it('serializes all browser attributes in order', () => {
    const row = createCookieRow({
      key: 'sid',
      value: 'abc',
      domain: '.example.com',
      path: '/',
      maxAge: '3600',
      secure: true,
      httpOnly: true,
      sameSite: 'Strict',
    })
    const s = cookieToSetCookieString(row)
    expect(s).toContain('sid=abc')
    expect(s).toContain('Domain=.example.com')
    expect(s).toContain('Path=/')
    expect(s).toContain('Max-Age=3600')
    expect(s).toContain('Secure')
    expect(s).toContain('HttpOnly')
    expect(s).toContain('SameSite=Strict')
  })

  it('skips Max-Age when the value is not numeric', () => {
    const row = createCookieRow({ key: 'sid', value: 'abc', maxAge: 'soon' })
    expect(cookieToSetCookieString(row)).not.toContain('Max-Age')
  })
})

describe('parseSetCookieString', () => {
  it('round-trips against cookieToSetCookieString for a typical cookie', () => {
    const original = createCookieRow({
      key: 'sid',
      value: 'abc',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    })
    const serialized = cookieToSetCookieString(original)
    const parsed = parseSetCookieString(serialized)
    expect(parsed).not.toBeNull()
    expect(parsed!.key).toBe('sid')
    expect(parsed!.value).toBe('abc')
    expect(parsed!.domain).toBe('.example.com')
    expect(parsed!.path).toBe('/')
    expect(parsed!.secure).toBe(true)
    expect(parsed!.httpOnly).toBe(true)
    expect(parsed!.sameSite).toBe('Lax')
  })

  it('returns null for empty / nameless input', () => {
    expect(parseSetCookieString('')).toBeNull()
    expect(parseSetCookieString('   ')).toBeNull()
    expect(parseSetCookieString('NoEqualsSign')).toBeNull()
    expect(parseSetCookieString('=onlyvalue')).toBeNull()
  })

  it('treats attribute names case-insensitively', () => {
    const parsed = parseSetCookieString('sid=abc; domain=foo.com; PATH=/; secure; HTTPONLY')
    expect(parsed).not.toBeNull()
    expect(parsed!.domain).toBe('foo.com')
    expect(parsed!.path).toBe('/')
    expect(parsed!.secure).toBe(true)
    expect(parsed!.httpOnly).toBe(true)
  })
})
