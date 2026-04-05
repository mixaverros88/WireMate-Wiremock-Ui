/**
 * StubsView contract tests.
 *
 * The page used to do server-side pagination + client-side filtering on
 * the *current page only*, so a filter could show "0 results" while
 * matches lived on other pages. The current implementation loads every
 * mapping once and filters client-side; pagination, page size, and the
 * "Showing X of Y" counter were removed in favour of a flat list with
 * an inline "<filtered> of <total> stubs" chip.
 *
 * These tests pin:
 *   - `fetchAllStubs` is called once with no pagination args
 *   - the result-count chip is driven by the *filtered* list
 *   - "Delete All" routes through `deleteAllStubs()` and is disabled
 *     when the list is empty
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

vi.mock('../services/stubService', () => ({
  fetchAllStubs: vi.fn(),
  deleteStub: vi.fn(),
  deleteAllStubs: vi.fn().mockResolvedValue(undefined),
}))

import StubsView from './StubsView.vue'
import { fetchAllStubs, deleteAllStubs } from '../services/stubService'

;(globalThis as any).__APP_VERSION__ = '0.0.0-test'

function makeStub(id: string, url = '/api/x', method = 'GET'): any {
  return {
    id,
    name: id,
    request: { method, url },
    response: { status: 200 },
    persistent: true,
    metadata: {},
  }
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/stubs', name: 'stubs', component: StubsView },
      { path: '/stubs/:id', name: 'stub-detail', component: { template: '<div />' } },
      { path: '/logs', name: 'logs', component: { template: '<div />' } },
      { path: '/projects/:id', name: 'project', component: { template: '<div />' } },
      { path: '/projects/:id/mocks/:mockId/edit', name: 'edit-mock', component: { template: '<div />' } },
    ],
  })
}

async function mountStubs() {
  const router = makeRouter()
  await router.push('/stubs')
  await router.isReady()
  const wrapper = mount(StubsView, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  ;(fetchAllStubs as any).mockReset()
  ;(deleteAllStubs as any).mockReset()
  ;(deleteAllStubs as any).mockResolvedValue(undefined)
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('StubsView — load + filter', () => {
  it('calls fetchAllStubs once with no pagination args (the page loads everything)', async () => {
    ;(fetchAllStubs as any).mockResolvedValueOnce({
      mappings: [makeStub('s1')],
      meta: { total: 1 },
    })
    const { wrapper } = await mountStubs()
    expect(fetchAllStubs).toHaveBeenCalledTimes(1)
    // Page now loads the whole list — no `limit` / `offset` / `pageSize` argument.
    const args = (fetchAllStubs as any).mock.calls[0]
    expect(args[0]).toBeUndefined()
    wrapper.unmount()
  })

  it('result-count chip reads "<filtered> of <total> stubs" and tracks the search input', async () => {
    ;(fetchAllStubs as any).mockResolvedValueOnce({
      mappings: [
        makeStub('s1', '/alpha'),
        makeStub('s2', '/beta'),
        makeStub('s3', '/gamma'),
      ],
      meta: { total: 3 },
    })
    const { wrapper } = await mountStubs()
    expect(wrapper.text()).toMatch(/3 of 3 stubs/)

    const search = wrapper.find<HTMLInputElement>('input[placeholder="Search by URL or method..."]')
    await search.setValue('alph')
    // debouncedSearch waits 300ms; flush the macrotask queue.
    await new Promise(r => setTimeout(r, 350))
    await flushPromises()
    expect(wrapper.text()).toMatch(/1 of 3 stubs/)
    wrapper.unmount()
  })

  it('does NOT render any pagination chrome (page size, Prev/Next, Pagination component)', async () => {
    ;(fetchAllStubs as any).mockResolvedValueOnce({
      mappings: Array.from({ length: 50 }, (_, i) => makeStub(`s${i}`)),
      meta: { total: 50 },
    })
    const { wrapper } = await mountStubs()
    expect(wrapper.text()).not.toMatch(/Page Size/i)
    expect(wrapper.text()).not.toMatch(/^\s*Prev\s*$/m)
    expect(wrapper.text()).not.toMatch(/^\s*Next\s*$/m)
    expect(wrapper.findAll('[class*="pagination"]')).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('StubsView — Delete All', () => {
  it('Delete All button is disabled when there are no stubs', async () => {
    ;(fetchAllStubs as any).mockResolvedValueOnce({ mappings: [], meta: { total: 0 } })
    const { wrapper } = await mountStubs()
    const btn = wrapper.findAll('button').find(b => /Delete All/.test(b.text()))!
    expect(btn).toBeDefined()
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    wrapper.unmount()
  })

  it('Delete All opens a confirm modal, calls deleteAllStubs on confirm, and clears the list', async () => {
    ;(fetchAllStubs as any).mockResolvedValueOnce({
      mappings: [makeStub('s1'), makeStub('s2')],
      meta: { total: 2 },
    })
    const { wrapper } = await mountStubs()
    const btn = wrapper.findAll('button').find(b => /Delete All/.test(b.text()))!
    await btn.trigger('click')
    await flushPromises()

    // Confirm modal mounted via Teleport — search the whole document.
    const allButtons = Array.from(document.querySelectorAll('button'))
    const confirm = allButtons.find(b => /Yes, delete all/.test(b.textContent || ''))
    expect(confirm, 'confirm button visible in the delete-all modal').toBeDefined()
    confirm?.click()
    await flushPromises()

    expect(deleteAllStubs).toHaveBeenCalledTimes(1)
    // Counter now shows "0 of 0 stubs".
    expect(wrapper.text()).toMatch(/0 of 0 stubs/)
    wrapper.unmount()
  })
})
