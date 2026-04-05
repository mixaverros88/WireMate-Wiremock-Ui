/**
 * Tests for FaultSimulationSection.
 *
 * The behaviour we care about:
 *   - The checkbox is disabled when proxyEnabled is true.
 *   - The fault-type dropdown only appears when the checkbox is on.
 *   - The description updates with the selected fault type.
 *   - Changing the dropdown emits update:faultType.
 */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FaultSimulationSection from './FaultSimulationSection.vue'

const baseProps = {
  collapsed: false,
  enabled: false,
  faultType: 'EMPTY_RESPONSE' as const,
  proxyEnabled: false,
}

describe('FaultSimulationSection', () => {
  it('renders the toggle checkbox by default', () => {
    const wrapper = mount(FaultSimulationSection, { props: baseProps })
    expect(wrapper.find('input[id="enableFault"]').exists()).toBe(true)
  })

  it('hides the dropdown until enabled=true', () => {
    const wrapper = mount(FaultSimulationSection, { props: baseProps })
    expect(wrapper.find('button[aria-label="Fault Type"]').exists()).toBe(false)
  })

  it('shows the dropdown when enabled=true', () => {
    const wrapper = mount(FaultSimulationSection, {
      props: { ...baseProps, enabled: true },
    })
    expect(wrapper.find('button[aria-label="Fault Type"]').exists()).toBe(true)
  })

  it('disables the checkbox while proxyEnabled is true and shows the warning', () => {
    const wrapper = mount(FaultSimulationSection, {
      props: { ...baseProps, proxyEnabled: true },
    })
    const checkbox = wrapper.find<HTMLInputElement>('input[id="enableFault"]')
    expect(checkbox.element.disabled).toBe(true)
    expect(wrapper.text()).toContain('unavailable while Proxying is enabled')
  })

  it('emits update:enabled when the checkbox toggles', async () => {
    const wrapper = mount(FaultSimulationSection, { props: baseProps })
    await wrapper.find('input[id="enableFault"]').setValue(true)
    expect(wrapper.emitted('update:enabled')?.[0]).toEqual([true])
  })

  it('emits update:faultType when the user selects a different fault', async () => {
    const wrapper = mount(FaultSimulationSection, {
      props: { ...baseProps, enabled: true },
    })
    // BaseDropdown is a trigger button + listbox of option buttons.
    await wrapper.find('button[aria-label="Fault Type"]').trigger('click')
    const option = wrapper
      .findAll('ul[role="listbox"] button')
      .find((b) => b.text() === 'Connection Reset by Peer')
    expect(option).toBeTruthy()
    await option!.trigger('click')
    expect(wrapper.emitted('update:faultType')?.[0]).toEqual(['CONNECTION_RESET_BY_PEER'])
  })

  it('shows the description for the selected fault type', () => {
    const wrapper = mount(FaultSimulationSection, {
      props: { ...baseProps, enabled: true, faultType: 'CONNECTION_RESET_BY_PEER' },
    })
    expect(wrapper.text()).toContain('Immediately reset the TCP connection')
  })

  it('emits toggle when the section header is clicked', async () => {
    const wrapper = mount(FaultSimulationSection, { props: baseProps })
    // The section header button is the first button inside CollapsibleSection.
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('toggle')).toBeTruthy()
  })
})
