/**
 * Tests for WebhooksSection.
 *
 * The interesting behaviours:
 *   - URL field shows a "must be absolute http(s)" error when the user
 *     types something that doesn't parse — but stays silent on empty
 *     input (form-level required-field validation handles that).
 *   - Headers are an array of KeyValuePair; adding/removing rows works.
 *   - The delay-ms hint is formatted with the correct precision
 *     (3 decimals < 1s, 2 decimals >= 1s).
 *   - The whole inner form is hidden when `enabled=false`.
 */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WebhooksSection from './WebhooksSection.vue'

const baseProps = {
  collapsed: false,
  enabled: true,
  url: '',
  method: 'POST',
  headers: [] as Array<{ key: string; value: string }>,
  body: '',
  delayMs: 0,
}

describe('WebhooksSection', () => {
  it('hides the inner form when enabled is false', () => {
    const wrapper = mount(WebhooksSection, {
      props: { ...baseProps, enabled: false },
    })
    expect(wrapper.find('input[placeholder="https://example.com/webhook"]').exists()).toBe(false)
  })

  it('does not flag empty URL inline (form-level required handles that)', () => {
    const wrapper = mount(WebhooksSection, { props: baseProps })
    expect(wrapper.text()).not.toContain('Invalid URL')
  })

  it('flags non-absolute URL with the error copy', () => {
    const wrapper = mount(WebhooksSection, {
      props: { ...baseProps, url: '/relative-only' },
    })
    expect(wrapper.text()).toContain('Invalid URL')
  })

  it('accepts a valid https URL silently', () => {
    const wrapper = mount(WebhooksSection, {
      props: { ...baseProps, url: 'https://example.com/hook' },
    })
    expect(wrapper.text()).not.toContain('Invalid URL')
  })

  it('emits update:enabled when the checkbox toggles', async () => {
    const wrapper = mount(WebhooksSection, { props: baseProps })
    await wrapper.find('input[id="enableWebhook"]').setValue(false)
    expect(wrapper.emitted('update:enabled')?.[0]).toEqual([false])
  })

  it('renders an option for each non-ANY HTTP method', async () => {
    const wrapper = mount(WebhooksSection, { props: baseProps })
    // BaseDropdown renders its rows only while open — click the trigger first.
    await wrapper.find('button[aria-label="Webhook method"]').trigger('click')
    const options = wrapper.findAll('ul[role="listbox"] button').map((b) => b.text())
    expect(options).toContain('GET')
    expect(options).toContain('POST')
    expect(options).not.toContain('ANY')
  })

  it('formats sub-second delay with 3 decimals', () => {
    const wrapper = mount(WebhooksSection, {
      props: { ...baseProps, delayMs: 250 },
    })
    expect(wrapper.text()).toMatch(/0\.250 s/)
  })

  it('formats multi-second delay with 2 decimals', () => {
    // 12345 ms / 1000 = 12.345 s, which .toFixed(2) rounds to "12.35".
    const wrapper = mount(WebhooksSection, {
      props: { ...baseProps, delayMs: 12345 },
    })
    expect(wrapper.text()).toMatch(/12\.35 s/)
  })

  it('omits the delay hint when delayMs is zero or invalid', () => {
    const wrapper = mount(WebhooksSection, {
      props: { ...baseProps, delayMs: 0 },
    })
    expect(wrapper.text()).not.toMatch(/= [\d.]+ s/)
  })

  it('shows the Handlebars sample as the body textarea placeholder', () => {
    // The body field is a freeform textarea — we hint at the helpers
    // WireMock supports via a multi-line placeholder. Pinning it here
    // so a future copy edit doesn't silently drop the template.
    const wrapper = mount(WebhooksSection, { props: baseProps })
    const placeholder = wrapper.find('textarea').attributes('placeholder') ?? ''
    expect(placeholder).toContain('"event": "stub-matched"')
    expect(placeholder).toContain("{{jsonPath request.body '$.orderId'}}")
    expect(placeholder).toContain('{{now}}')
    expect(placeholder).toContain('{{request.url}}')
  })
})
