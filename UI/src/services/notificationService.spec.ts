/**
 * Tests for `normalizeNotificationResponse` — the shape-normalizer that
 * lets the UI tolerate the three response formats the backend has
 * historically emitted (bare array, items+total wrapper, Spring page).
 *
 * The wire fetch is intentionally NOT exercised here (that's covered by
 * the http.ts tests and integration tests); this just pins the shape
 * mapping.
 */

import { describe, expect, it } from 'vitest'
import { normalizeNotificationResponse } from './notificationService'

describe('normalizeNotificationResponse', () => {
  it('wraps a bare array into a page with fallback paging info', () => {
    const result = normalizeNotificationResponse(
      [{ id: 1, name: 'a', createdAt: '', updatedAt: '' }],
      50,
      100,
    )
    expect(result).toEqual({
      items: [{ id: 1, name: 'a', createdAt: '', updatedAt: '' }],
      total: 1,
      limit: 50,
      offset: 100,
    })
  })

  it('passes items+total+limit+offset through when the backend returns them', () => {
    const result = normalizeNotificationResponse(
      { items: [{ id: 1 }, { id: 2 }], total: 42, limit: 25, offset: 50 },
      0,
      0,
    )
    expect(result.total).toBe(42)
    expect(result.limit).toBe(25)
    expect(result.offset).toBe(50)
    expect(result.items).toHaveLength(2)
  })

  it('honors fallback values when the wrapper omits paging fields', () => {
    const result = normalizeNotificationResponse(
      { items: [{ id: 1 }] },
      77,
      200,
    )
    expect(result.limit).toBe(77)
    expect(result.offset).toBe(200)
    expect(result.total).toBe(1) // fell back to items.length
  })

  it('maps a Spring-style `content/totalElements/size/number` page', () => {
    const result = normalizeNotificationResponse(
      {
        content: [{ id: 1 }, { id: 2 }],
        totalElements: 100,
        size: 25,
        number: 3,    // 0-indexed page 3
      },
      0,
      0,
    )
    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(100)
    expect(result.limit).toBe(25)
    expect(result.offset).toBe(75) // page 3 * size 25
  })

  it('returns an empty page for null / unknown shapes', () => {
    expect(normalizeNotificationResponse(null, 50, 0)).toEqual({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    })
    expect(normalizeNotificationResponse('not an object', 50, 0).items).toEqual([])
    expect(normalizeNotificationResponse({ no_known_keys: 1 }, 50, 0).items).toEqual([])
  })

  it('falls back to default limit when wrapper.limit is non-positive', () => {
    const result = normalizeNotificationResponse(
      { items: [], limit: 0, offset: 0 },
      99,
      0,
    )
    expect(result.limit).toBe(99) // 0 is invalid, fall back
  })
})
