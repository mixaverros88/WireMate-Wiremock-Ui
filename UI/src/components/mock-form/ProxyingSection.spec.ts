/**
 * Tests for ProxyingSection.
 *
 * Three concerns:
 *   - Mutually exclusive with Fault Simulation (checkbox disabled
 *     when faultEnabled, with explanatory amber copy).
 *   - URL validation mirrors WebhooksSection: empty silent, typed-
 *     but-malformed flagged.
 *   - removeHeaders dedupes case-insensitively (HTTP header names
 *     are case-insensitive, so "Cookie" and "cookie" are the same).
 */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ProxyingSection from './ProxyingSection.vue'

const baseProps = {
  collapsed: false,
  enabled: true,
  baseUrl: '',
  additionalHeaders: [] as Array<{ key: string; value: string }>,
  removeHeaders: [] as string[],
  removeInput: '',
  faultEnabled: false,
}

describe('ProxyingSection', () => {
  it('disables the toggle when fault simulation is on', () => {
    const wrapper = mount(ProxyingSection, {
      props: { ...baseProps, faultEnabled: true },
    })
    expect(wrapper.find<HTMLInputElement>('#enableProxy').element.disabled).toBe(true)
    expect(wrapper.text()).toContain('unavailable while Fault Simulation is enabled')
  })

  it('does not flag empty URL inline (form-level required handles that)', () => {
    const wrapper = mount(ProxyingSection, { props: baseProps })
    expect(wrapper.text()).not.toContain('Invalid URL')
  })

  it('flags a non-absolute URL with the error copy', () => {
    const wrapper = mount(ProxyingSection, {
      props: { ...baseProps, baseUrl: 'localhost' },
    })
    expect(wrapper.text()).toContain('Invalid URL')
  })

  it('accepts a valid http URL silently', () => {
    const wrapper = mount(ProxyingSection, {
      props: { ...baseProps, baseUrl: 'http://api.example.com' },
    })
    expect(wrapper.text()).not.toContain('Invalid URL')
  })

  it('emits update:removeHeaders when a name is added', async () => {
    const wrapper = mount(ProxyingSection, {
      props: { ...baseProps, removeInput: 'Authorization' },
    })
    // Find the "Add" button next to the remove-input field.
    const addButtons = wrapper.findAll('button').filter((b) => b.text() === 'Add')
    expect(addButtons.length).toBe(1)
    await addButtons[0].trigger('click')
    expect(wrapper.emitted('update:removeHeaders')?.[0]).toEqual([['Authorization']])
    expect(wrapper.emitted('update:removeInput')?.[0]).toEqual([''])
  })

  it('dedupes removeHeaders case-insensitively', async () => {
    const wrapper = mount(ProxyingSection, {
      props: { ...baseProps, removeHeaders: ['Authorization'], removeInput: 'authorization' },
    })
    const addButtons = wrapper.findAll('button').filter((b) => b.text() === 'Add')
    await addButtons[0].trigger('click')
    // No update:removeHeaders emitted because the (case-insensitive) dup was rejected.
    expect(wrapper.emitted('update:removeHeaders')).toBeUndefined()
    // The input still gets cleared.
    expect(wrapper.emitted('update:removeInput')?.[0]).toEqual([''])
  })

  it('hides the inner form when enabled is false', () => {
    const wrapper = mount(ProxyingSection, {
      props: { ...baseProps, enabled: false },
    })
    expect(wrapper.find('input[placeholder="https://api.example.com"]').exists()).toBe(false)
  })

  it('emits update:enabled when the toggle changes', async () => {
    const wrapper = mount(ProxyingSection, { props: baseProps })
    await wrapper.find('input[id="enableProxy"]').setValue(false)
    expect(wrapper.emitted('update:enabled')?.[0]).toEqual([false])
  })
})
