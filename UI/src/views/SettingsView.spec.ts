/**
 * SettingsView tests.
 *
 * The Global Response Delay and Request Journal panels were removed; the
 * page now just surfaces Server Health and the Danger Zone (Reset All /
 * Shutdown Server). These tests pin what's left so accidental wiring
 * regressions (e.g. losing the refetch on click, or surfacing the
 * deleted controls again) fail loudly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('../services/settingsService', () => ({
  fetchHealth: vi.fn().mockResolvedValue({
    status: 'healthy', version: '3.6.0', uptimeInSeconds: 1, message: '', timestamp: new Date().toISOString(),
  }),
  fetchVersion: vi.fn().mockResolvedValue({ version: '3.6.0' }),
  resetAll: vi.fn().mockResolvedValue(undefined),
  shutdownServer: vi.fn().mockResolvedValue(undefined),
}))

import SettingsView from './SettingsView.vue'
import { fetchHealth, resetAll } from '../services/settingsService'

;(globalThis as any).__APP_VERSION__ = '0.0.0-test'

async function mountSettings() {
  const wrapper = mount(SettingsView, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  ;(fetchHealth as any).mockClear()
  ;(resetAll as any).mockClear()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('SettingsView — surfaces only Health + Danger Zone', () => {
  it('renders Server Health populated from fetchHealth', async () => {
    const wrapper = await mountSettings()
    expect(fetchHealth).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('Server Health')
    expect(wrapper.text()).toContain('healthy')
    expect(wrapper.text()).toContain('3.6.0')
    wrapper.unmount()
  })

  it('does NOT render the removed Global Response Delay or Request Journal sections', async () => {
    const wrapper = await mountSettings()
    expect(wrapper.text()).not.toMatch(/Global Response Delay/)
    expect(wrapper.text()).not.toMatch(/Request Journal/)
    expect(wrapper.text()).not.toMatch(/Save Settings/)
    expect(wrapper.text()).not.toMatch(/Clear Journal/)
    // The delay-checkbox id is gone too — make sure no stray controls leak.
    expect(wrapper.find('#delayEnabled').exists()).toBe(false)
    wrapper.unmount()
  })

  it('Refresh re-loads health (one extra fetchHealth call)', async () => {
    const wrapper = await mountSettings()
    const refresh = wrapper.findAll('button').find(b => /Refresh/.test(b.text()))!
    await refresh.trigger('click')
    await flushPromises()
    expect(fetchHealth).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})

describe('SettingsView — Danger Zone', () => {
  it('Reset All requires a confirmation click before calling resetAll', async () => {
    const wrapper = await mountSettings()
    const reset = wrapper.findAll('button').find(b => /^Reset$/.test(b.text().trim()))!
    await reset.trigger('click')
    await flushPromises()
    // Confirmation prompt should now be visible.
    expect(wrapper.text()).toContain('Are you sure?')
    expect(resetAll).not.toHaveBeenCalled()

    const confirm = wrapper.findAll('button').find(b => /^Confirm$/.test(b.text().trim()))!
    await confirm.trigger('click')
    await flushPromises()
    expect(resetAll).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
