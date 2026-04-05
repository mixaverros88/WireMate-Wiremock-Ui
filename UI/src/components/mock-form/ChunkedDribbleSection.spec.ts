/**
 * Tests for ChunkedDribbleSection.
 *
 * Targets the live-feedback computations (msPerChunk, bytesPerChunk,
 * dribbleNoBody) that used to live in CreateMock — now pure
 * derivations of the props.
 */

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ChunkedDribbleSection from './ChunkedDribbleSection.vue'

const baseProps = {
  collapsed: false,
  enabled: true,
  numberOfChunks: 5,
  totalDuration: 1000,
  faultEnabled: false,
  responseBodyLength: 500,
}

describe('ChunkedDribbleSection', () => {
  it('renders the live ms-per-chunk hint when active', () => {
    const wrapper = mount(ChunkedDribbleSection, { props: baseProps })
    // 1000 / 5 = 200 ms per chunk.
    expect(wrapper.text()).toContain('200 ms per chunk')
  })

  it('renders the bytes-per-chunk hint when there is a body', () => {
    const wrapper = mount(ChunkedDribbleSection, { props: baseProps })
    // 500 / 5 = 100 bytes per chunk.
    expect(wrapper.text()).toContain('100 byte')
  })

  it('warns when there is no body to dribble', () => {
    const wrapper = mount(ChunkedDribbleSection, {
      props: { ...baseProps, responseBodyLength: 0 },
    })
    expect(wrapper.text()).toContain('no effect without a response body')
  })

  it('skips live hints when the section is bypassed by fault simulation', () => {
    const wrapper = mount(ChunkedDribbleSection, {
      props: { ...baseProps, faultEnabled: true },
    })
    expect(wrapper.text()).toContain('ignored while Fault Simulation is active')
    // The bytes-per-chunk hint should not render when not "active".
    expect(wrapper.text()).not.toContain('100 byte')
  })

  it('does not render hints for invalid (NaN / negative) numeric inputs', () => {
    const wrapper = mount(ChunkedDribbleSection, {
      props: { ...baseProps, numberOfChunks: Number.NaN },
    })
    // Match the hint pattern (`≈ <N> bytes per chunk`) rather than
    // the bare word "byte" — the section header itself says "Trickle
    // response bytes over time…" so the previous assertion was a
    // false negative.
    expect(wrapper.text()).not.toMatch(/bytes per chunk/)
  })

  it('emits update:numberOfChunks when the chunks input changes', async () => {
    const wrapper = mount(ChunkedDribbleSection, { props: baseProps })
    const inputs = wrapper.findAll<HTMLInputElement>('input[type="number"]')
    expect(inputs.length).toBe(2)
    await inputs[0].setValue('10')
    expect(wrapper.emitted('update:numberOfChunks')?.[0]).toEqual([10])
  })

  it('emits update:totalDuration when the duration input changes', async () => {
    const wrapper = mount(ChunkedDribbleSection, { props: baseProps })
    const inputs = wrapper.findAll<HTMLInputElement>('input[type="number"]')
    await inputs[1].setValue('2500')
    expect(wrapper.emitted('update:totalDuration')?.[0]).toEqual([2500])
  })

  it('formats the total duration in seconds for readable hints', () => {
    // 12345 ms / 1000 = 12.345 s, which .toFixed(2) rounds to "12.35".
    const longer = mount(ChunkedDribbleSection, {
      props: { ...baseProps, totalDuration: 12345 },
    })
    expect(longer.text()).toMatch(/12\.35 s/)

    const shorter = mount(ChunkedDribbleSection, {
      props: { ...baseProps, totalDuration: 250 },
    })
    expect(shorter.text()).toMatch(/0\.250 s/)
  })
})
