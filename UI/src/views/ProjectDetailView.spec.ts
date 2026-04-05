/**
 * Regression test for ProjectDetailView's route-param-staleness fix.
 *
 * Originally `const projectId = route.params.id as string` was captured
 * ONCE at setup, so Vue Router reusing the component (same `name`,
 * different `:id`) left the view showing the previous project's data
 * even though the URL had changed. The fix:
 *   - `projectId = computed(() => route.params.id as string)`
 *   - `watch(projectId, ...)` triggers `loadProject()` on route change
 *   - monotonic `loadToken` discards stale fetch results
 *
 * The contract pinned here:
 *   1. Initial mount fetches the project at the current `:id`.
 *   2. Navigating to a different `:id` triggers a SECOND `fetchProject`
 *      with the new id.
 *   3. Async-results returning out of order (B started before A but A
 *      resolves first) do NOT clobber the latest project — verified
 *      via a slow first fetch + fast second fetch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'

vi.mock('../services/projectService', () => ({
  fetchProject: vi.fn(),
  fetchProjects: vi.fn().mockResolvedValue([]),
  renameProject: vi.fn(),
}))
vi.mock('../services/mockService', () => ({
  deleteMock: vi.fn(),
  cloneMock: vi.fn(),
  moveMock: vi.fn(),
}))
vi.mock('../services/stubService', () => ({
  checkStubExists: vi.fn().mockResolvedValue(true),
}))
vi.mock('../services/api', () => ({
  mockApi: { republish: vi.fn() },
}))

import ProjectDetailView from './ProjectDetailView.vue'
import { fetchProject } from '../services/projectService'

;(globalThis as any).__APP_VERSION__ = '0.0.0-test'

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects', name: 'projects', component: { template: '<div />' } },
      { path: '/projects/:id', name: 'project', component: ProjectDetailView },
      { path: '/projects/:id/mocks/:mockId/edit', name: 'edit-mock', component: { template: '<div />' } },
      { path: '/logs', name: 'logs', component: { template: '<div />' } },
    ],
  })
}

async function mountAtRoute(initialPath: string) {
  const router = makeRouter()
  await router.push(initialPath)
  await router.isReady()
  const wrapper = mount(
    {
      template: '<router-view />',
    },
    {
      global: { plugins: [router] },
      attachTo: document.body,
    },
  )
  await flushPromises()
  return { wrapper, router }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('ProjectDetailView — route-param staleness regression', () => {
  beforeEach(() => {
    ;(fetchProject as any).mockReset()
  })

  it('fetches the project at the initial route id on mount', async () => {
    ;(fetchProject as any).mockResolvedValueOnce({
      id: 'proj-a', name: 'A', mocks: [], createdAt: '', updatedAt: '',
    })
    const { wrapper } = await mountAtRoute('/projects/proj-a')
    expect(fetchProject).toHaveBeenCalledWith('proj-a')
    wrapper.unmount()
  })

  it('re-fetches when route param changes (the bug we fixed)', async () => {
    ;(fetchProject as any)
      .mockResolvedValueOnce({ id: 'proj-a', name: 'A', mocks: [], createdAt: '', updatedAt: '' })
      .mockResolvedValueOnce({ id: 'proj-b', name: 'B', mocks: [], createdAt: '', updatedAt: '' })

    const { wrapper, router } = await mountAtRoute('/projects/proj-a')
    expect(fetchProject).toHaveBeenCalledTimes(1)
    expect(fetchProject).toHaveBeenLastCalledWith('proj-a')

    await router.push('/projects/proj-b')
    await flushPromises()
    await nextTick()
    expect(fetchProject).toHaveBeenCalledTimes(2)
    expect(fetchProject).toHaveBeenLastCalledWith('proj-b')
    wrapper.unmount()
  })

  it('discards a stale fetch result via the load-token guard', async () => {
    // First fetch is slow; second fetch (after route change) is fast and
    // wins. When the slow first one finally resolves, its result must NOT
    // overwrite the now-displayed project B.
    let resolveSlow!: (v: unknown) => void
    const slow = new Promise((r) => { resolveSlow = r })
    ;(fetchProject as any)
      .mockImplementationOnce(() => slow)
      .mockResolvedValueOnce({ id: 'proj-b', name: 'B', mocks: [], createdAt: '', updatedAt: '' })

    const { wrapper, router } = await mountAtRoute('/projects/proj-a')
    expect(fetchProject).toHaveBeenCalledTimes(1)

    await router.push('/projects/proj-b')
    await flushPromises()
    expect(fetchProject).toHaveBeenCalledTimes(2)

    // Now late-resolve the first call.
    resolveSlow({ id: 'proj-a', name: 'A — STALE', mocks: [], createdAt: '', updatedAt: '' })
    await flushPromises()
    await nextTick()

    // The UI should still show project B (latest), not A. We assert via
    // visible text: project B's name should be rendered, A's STALE name
    // should not.
    expect(wrapper.text()).toContain('B')
    expect(wrapper.text()).not.toContain('A — STALE')
    wrapper.unmount()
  })
})
