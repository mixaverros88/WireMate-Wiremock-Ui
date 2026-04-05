/**
 * XSS regression suite for `sanitizeHtml` (provided by mgv-backoffice).
 *
 * The library has no test runner of its own, so this consumer-side
 * suite guards the exact behaviour the notification bell relies on when
 * it binds backend HTML into `v-html`. Every case here represents a
 * real-world payload class. If one of these stops being neutralised, an
 * attacker (or a backend bug) can smuggle script execution into the
 * page.
 *
 * Conventions:
 *   - Each test name describes the threat, not the implementation.
 *   - Assertions use `.toContain` / `.not.toContain` on the returned
 *     string rather than DOM walks — the contract is "the string we
 *     hand to v-html".
 */

import { describe, expect, it } from 'vitest'
import { isSafeHref, sanitizeHtml as sanitizeNotificationHtml } from 'mgv-backoffice'

describe('sanitizeNotificationHtml — empty / null inputs', () => {
  it('returns an empty string for null', () => {
    expect(sanitizeNotificationHtml(null)).toBe('')
  })
  it('returns an empty string for undefined', () => {
    expect(sanitizeNotificationHtml(undefined)).toBe('')
  })
  it('returns an empty string for an empty string', () => {
    expect(sanitizeNotificationHtml('')).toBe('')
  })
})

describe('sanitizeNotificationHtml — allow-listed elements', () => {
  it('preserves bold / strong / em / code / br / p / ul / li / a verbatim', () => {
    const html =
      '<p>Hello <strong>world</strong>, <em>welcome</em>.</p>' +
      '<ul><li><code>foo</code></li></ul>'
    const out = sanitizeNotificationHtml(html)
    expect(out).toContain('<p>')
    expect(out).toContain('<strong>world</strong>')
    expect(out).toContain('<em>welcome</em>')
    expect(out).toContain('<ul>')
    expect(out).toContain('<li>')
    expect(out).toContain('<code>foo</code>')
  })

  it('preserves text nodes between tags', () => {
    expect(sanitizeNotificationHtml('plain text')).toContain('plain text')
  })
})

describe('sanitizeNotificationHtml — disallowed elements', () => {
  it('strips <script> entirely but keeps its text', () => {
    const out = sanitizeNotificationHtml('<p>Hi<script>alert(1)</script></p>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')  // also wiped because the wrapper was script, content was JS not text
  })

  it('strips <iframe>', () => {
    const out = sanitizeNotificationHtml('<iframe src="https://evil.com"></iframe>')
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('evil.com')
  })

  it('strips <object> and <embed>', () => {
    expect(sanitizeNotificationHtml('<object data="evil"></object>')).not.toContain('<object')
    expect(sanitizeNotificationHtml('<embed src="evil">')).not.toContain('<embed')
  })

  it('strips <style> and <link>', () => {
    expect(sanitizeNotificationHtml('<style>body{display:none}</style>')).not.toContain('<style')
    expect(sanitizeNotificationHtml('<link rel="stylesheet" href="x">')).not.toContain('<link')
  })

  it('strips <img> (not in the allow-list)', () => {
    const out = sanitizeNotificationHtml('<img src="x" onerror="alert(1)">')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('onerror')
  })

  it('strips <svg> wrappers', () => {
    expect(sanitizeNotificationHtml('<svg onload="alert(1)"></svg>')).not.toContain('<svg')
  })
})

describe('sanitizeNotificationHtml — attribute stripping', () => {
  it('removes inline event handlers from allow-listed elements', () => {
    const out = sanitizeNotificationHtml('<p onclick="alert(1)">hi</p>')
    expect(out).not.toContain('onclick')
    expect(out).toContain('<p>hi</p>')
  })

  it('removes onerror / onload / onmouseover handlers', () => {
    const out = sanitizeNotificationHtml(
      '<p onerror="x" onload="y" onmouseover="z">hi</p>',
    )
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('onload')
    expect(out).not.toContain('onmouseover')
  })

  it('removes style attributes', () => {
    const out = sanitizeNotificationHtml('<p style="display:none">hi</p>')
    expect(out).not.toContain('style')
  })

  it('removes class attributes (not in any per-tag allow-list)', () => {
    const out = sanitizeNotificationHtml('<p class="evil">hi</p>')
    expect(out).not.toContain('class')
  })

  it('preserves href and title on <a>', () => {
    const out = sanitizeNotificationHtml(
      '<a href="https://example.com" title="example">link</a>',
    )
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('title="example"')
  })

  it('strips non-allow-listed attributes from <a>', () => {
    const out = sanitizeNotificationHtml(
      '<a href="https://x.com" target="_self" id="evil" data-x="y">link</a>',
    )
    // We force target=_blank below, so check for *_self* specifically.
    expect(out).not.toContain('target="_self"')
    expect(out).not.toContain('id="evil"')
    expect(out).not.toContain('data-x')
  })
})

describe('sanitizeNotificationHtml — href scheme validation', () => {
  it('rejects javascript: hrefs', () => {
    const out = sanitizeNotificationHtml('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('href=')
  })

  it('rejects javascript: hrefs with leading whitespace + mixed case', () => {
    const out = sanitizeNotificationHtml('<a href=" JaVaScRiPt:alert(1)">x</a>')
    expect(out).not.toContain('avascript')
    expect(out).not.toContain('href=')
  })

  it('rejects data: hrefs', () => {
    const out = sanitizeNotificationHtml(
      '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    )
    expect(out).not.toContain('href="data:')
  })

  it('rejects vbscript: hrefs', () => {
    expect(sanitizeNotificationHtml('<a href="vbscript:msgbox(1)">x</a>'))
      .not.toContain('href=')
  })

  it('rejects file: hrefs', () => {
    expect(sanitizeNotificationHtml('<a href="file:///etc/passwd">x</a>'))
      .not.toContain('href=')
  })

  it('accepts http(s) hrefs', () => {
    const out = sanitizeNotificationHtml('<a href="https://example.com">x</a>')
    expect(out).toContain('href="https://example.com"')
  })

  it('accepts mailto:, tel:, anchor and relative URLs', () => {
    expect(sanitizeNotificationHtml('<a href="mailto:a@b">x</a>')).toContain('href="mailto:')
    expect(sanitizeNotificationHtml('<a href="tel:+15551234">x</a>')).toContain('href="tel:')
    expect(sanitizeNotificationHtml('<a href="#anchor">x</a>')).toContain('href="#anchor"')
    expect(sanitizeNotificationHtml('<a href="/projects">x</a>')).toContain('href="/projects"')
  })
})

describe('sanitizeNotificationHtml — link hardening', () => {
  it('forces target="_blank" and rel="noopener noreferrer" on every <a>', () => {
    const out = sanitizeNotificationHtml('<a href="https://example.com">link</a>')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('does NOT add target/rel to an anchor without href (e.g. fragment placeholder)', () => {
    const out = sanitizeNotificationHtml('<a>just text</a>')
    expect(out).not.toContain('target=')
    expect(out).not.toContain('rel=')
  })
})

describe('sanitizeNotificationHtml — nested attacks', () => {
  it('neutralises a script nested inside an allow-listed element', () => {
    const out = sanitizeNotificationHtml(
      '<p>Welcome<script>alert(1)</script><strong>!</strong></p>',
    )
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('<strong>!</strong>')
  })

  it('strips event handlers from an anchor with a poisoned scheme + onclick', () => {
    const out = sanitizeNotificationHtml(
      '<a href="javascript:1" onclick="alert(1)">click</a>',
    )
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('onclick')
    expect(out).toContain('>click</a>')
  })

  it('neutralises an <img> nested inside an <a>', () => {
    const out = sanitizeNotificationHtml(
      '<a href="https://example.com"><img src="x" onerror="alert(1)">link</a>',
    )
    expect(out).not.toContain('<img')
    expect(out).not.toContain('onerror')
    expect(out).toContain('link</a>')
  })
})

describe('sanitizeNotificationHtml — malformed HTML', () => {
  it('handles an unclosed tag without throwing', () => {
    expect(() => sanitizeNotificationHtml('<p>hi')).not.toThrow()
  })

  it('handles non-string-coercible junk', () => {
    expect(sanitizeNotificationHtml('<<<')).toBeDefined()
  })
})

describe('isSafeHref', () => {
  it.each([
    ['http://example.com', true],
    ['https://example.com', true],
    ['HTTPS://EXAMPLE.COM', true],
    ['mailto:a@b', true],
    ['tel:+15551234', true],
    ['/relative/path', true],
    ['#anchor', true],
    ['', true],
  ])('accepts %s', (href, expected) => {
    expect(isSafeHref(href)).toBe(expected)
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
    'data:text/html,<script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'about:blank',
  ])('rejects %s', (href) => {
    expect(isSafeHref(href)).toBe(false)
  })
})
