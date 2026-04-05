/**
 * Tests for BasicAuthSection.
 *
 * The mode buttons + v-model bindings are the contract worth pinning;
 * the live base64 preview behaviour was the most-edited bit of the
 * old inline form.
 */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BasicAuthSection from './BasicAuthSection.vue'

const baseProps = {
  collapsed: false,
  enabled: true,
  username: '',
  password: '',
  mode: 'plain' as const,
}

describe('BasicAuthSection', () => {
  it('renders the section title via CollapsibleSection', () => {
    const wrapper = mount(BasicAuthSection, { props: baseProps })
    expect(wrapper.text()).toContain('Basic Authentication')
  })

  it('hides the inner form when enabled=false', () => {
    const wrapper = mount(BasicAuthSection, {
      props: { ...baseProps, enabled: false },
    })
    expect(wrapper.find('input[id="enableBasicAuth"]').exists()).toBe(true)
    // The username/password inputs are inside the v-if. They shouldn't render.
    expect(wrapper.findAll('input[placeholder="expected username"]')).toHaveLength(0)
  })

  it('emits update:enabled when the checkbox is toggled', async () => {
    const wrapper = mount(BasicAuthSection, { props: baseProps })
    const checkbox = wrapper.find('input[id="enableBasicAuth"]')
    await checkbox.setValue(false)
    expect(wrapper.emitted('update:enabled')?.[0]).toEqual([false])
  })

  it('emits update:username and update:password when the user types', async () => {
    const wrapper = mount(BasicAuthSection, { props: baseProps })
    const user = wrapper.find('input[placeholder="expected username"]')
    await user.setValue('alice')
    expect(wrapper.emitted('update:username')?.[0]).toEqual(['alice'])

    const pass = wrapper.find('input[placeholder="expected password"]')
    await pass.setValue('hunter2')
    expect(wrapper.emitted('update:password')?.[0]).toEqual(['hunter2'])
  })

  it('toggles mode between plain and base64 via the segmented control', async () => {
    const wrapper = mount(BasicAuthSection, { props: baseProps })
    // Find the two mode buttons by their text.
    const buttons = wrapper.findAll('button').filter((b) =>
      /Plain credentials|Authorization header/i.test(b.text()),
    )
    expect(buttons).toHaveLength(2)
    await buttons[1].trigger('click')
    expect(wrapper.emitted('update:mode')?.[0]).toEqual(['base64'])
  })

  it('renders the base64 preview only in base64 mode with non-empty credentials', () => {
    const empty = mount(BasicAuthSection, {
      props: { ...baseProps, mode: 'base64' },
    })
    // No preview yet — username + password are blank.
    expect(empty.text()).not.toContain('Authorization header preview')

    const filled = mount(BasicAuthSection, {
      props: {
        ...baseProps,
        mode: 'base64',
        username: 'alice',
        password: 'wonder',
      },
    })
    expect(filled.text()).toContain('Authorization header preview')
    // btoa('alice:wonder') = 'YWxpY2U6d29uZGVy'
    expect(filled.text()).toContain('Basic YWxpY2U6d29uZGVy')
  })

  it('survives non-ASCII characters in the base64 preview', () => {
    const wrapper = mount(BasicAuthSection, {
      props: { ...baseProps, mode: 'base64', username: 'ëlëven', password: 'pass' },
    })
    // We're not asserting the exact base64 — just that no exception was thrown
    // and the preview rendered something starting with "Basic ".
    expect(wrapper.text()).toMatch(/Basic [A-Za-z0-9+/=]+/)
  })
})
