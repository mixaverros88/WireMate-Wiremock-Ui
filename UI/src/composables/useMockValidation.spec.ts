/**
 * Vitest suite for the validation helpers extracted from CreateMock.vue.
 *
 * These functions used to live as a single 217-line `validationIssues`
 * computed inside CreateMock — untestable without rendering the whole
 * form. Now each rule is a pure function, so we can pin its behavior
 * with quick table-style tests.
 */

import { describe, expect, it } from 'vitest'
import {
  isValidAbsoluteUrl,
  validateBasicAuth,
  validateChunkedDribble,
  validateCookieAttributes,
  validateProxyUrl,
  validateUniformDelay,
  validateWebhookUrl,
} from './useMockValidation'
import { createCookieRow } from '../utils/cookies'

describe('isValidAbsoluteUrl', () => {
  it('accepts http and https', () => {
    expect(isValidAbsoluteUrl('http://example.com')).toBe(true)
    expect(isValidAbsoluteUrl('https://example.com/path?x=1')).toBe(true)
  })

  it('rejects empty, relative, and non-http(s) schemes', () => {
    expect(isValidAbsoluteUrl('')).toBe(false)
    expect(isValidAbsoluteUrl('/relative/path')).toBe(false)
    expect(isValidAbsoluteUrl('ftp://example.com')).toBe(false)
    expect(isValidAbsoluteUrl('mailto:a@b')).toBe(false)
    expect(isValidAbsoluteUrl('not a url')).toBe(false)
  })
})

describe('validateBasicAuth', () => {
  it('returns nothing when disabled', () => {
    expect(validateBasicAuth({ enabled: false, username: '', password: '' })).toEqual([])
  })

  it('flags missing username and password independently', () => {
    const result = validateBasicAuth({ enabled: true, username: '', password: '' })
    expect(result.map(r => r.message)).toEqual([
      'Username is required when Basic Auth matching is enabled.',
      'Password is required when Basic Auth matching is enabled.',
    ])
  })

  it('passes when both fields are non-empty', () => {
    expect(validateBasicAuth({ enabled: true, username: 'u', password: 'p' })).toEqual([])
  })
})

describe('validateWebhookUrl', () => {
  it('skips when disabled', () => {
    expect(validateWebhookUrl({ enabled: false, url: '' })).toEqual([])
  })

  it('requires a value when enabled', () => {
    const result = validateWebhookUrl({ enabled: true, url: '   ' })
    expect(result[0].message).toMatch(/required/i)
  })

  it('rejects non-absolute URLs', () => {
    const result = validateWebhookUrl({ enabled: true, url: '/relative' })
    expect(result[0].message).toMatch(/absolute/i)
  })

  it('accepts an absolute https URL', () => {
    expect(validateWebhookUrl({ enabled: true, url: 'https://example.com/hook' })).toEqual([])
  })
})

describe('validateProxyUrl', () => {
  it('mirrors validateWebhookUrl behavior but with Proxying section', () => {
    const result = validateProxyUrl({ enabled: true, url: '/relative' })
    expect(result[0].section).toBe('Proxying')
  })
})

describe('validateChunkedDribble', () => {
  it('bypasses validation when fault is enabled', () => {
    expect(
      validateChunkedDribble({
        faultEnabled: true,
        dribbleEnabled: true,
        numberOfChunks: 0,
        totalDuration: 0,
      }),
    ).toEqual([])
  })

  it('skips when dribble is off', () => {
    expect(
      validateChunkedDribble({
        faultEnabled: false,
        dribbleEnabled: false,
        numberOfChunks: 0,
        totalDuration: 0,
      }),
    ).toEqual([])
  })

  it('requires positive integers when enabled', () => {
    const result = validateChunkedDribble({
      faultEnabled: false,
      dribbleEnabled: true,
      numberOfChunks: 0,
      totalDuration: 0,
    })
    expect(result.map(r => r.message)).toEqual([
      'Number of chunks must be at least 1.',
      'Total duration must be at least 1 ms.',
    ])
  })

  it('accepts valid numeric inputs', () => {
    expect(
      validateChunkedDribble({
        faultEnabled: false,
        dribbleEnabled: true,
        numberOfChunks: 4,
        totalDuration: 500,
      }),
    ).toEqual([])
  })
})

describe('validateUniformDelay', () => {
  it('skips when not a uniform delay', () => {
    expect(
      validateUniformDelay({
        faultEnabled: false,
        delayEnabled: true,
        delayType: 'fixed',
        lower: -1,
        upper: -1,
      }),
    ).toEqual([])
  })

  it('rejects negative bounds and inverted ranges', () => {
    const result = validateUniformDelay({
      faultEnabled: false,
      delayEnabled: true,
      delayType: 'uniform',
      lower: 500,
      upper: 100,
    })
    expect(result.some(r => r.message.includes('Lower bound cannot be greater'))).toBe(true)
  })

  it('passes for a well-formed range', () => {
    expect(
      validateUniformDelay({
        faultEnabled: false,
        delayEnabled: true,
        delayType: 'uniform',
        lower: 50,
        upper: 200,
      }),
    ).toEqual([])
  })
})

describe('validateCookieAttributes', () => {
  it('returns nothing for valid response cookies', () => {
    const row = createCookieRow({
      direction: 'response',
      key: 'sid',
      value: 'abc',
      domain: 'example.com',
      path: '/',
    })
    expect(validateCookieAttributes([row])).toEqual([])
  })

  it('flags invalid domain', () => {
    const row = createCookieRow({
      direction: 'response',
      key: 'sid',
      value: 'abc',
      domain: 'https://nope',
    })
    const result = validateCookieAttributes([row])
    expect(result[0].message).toMatch(/Domain/)
  })

  it('flags invalid path', () => {
    const row = createCookieRow({
      direction: 'response',
      key: 'sid',
      value: 'abc',
      path: 'no-leading-slash',
    })
    const result = validateCookieAttributes([row])
    expect(result[0].message).toMatch(/Path/)
  })

  it('ignores request-side cookies (those attributes are response-only)', () => {
    const row = createCookieRow({
      direction: 'request',
      key: 'sid',
      value: 'abc',
      domain: 'invalid://',  // would fail on a response row
      path: 'invalid',
    })
    expect(validateCookieAttributes([row])).toEqual([])
  })
})
