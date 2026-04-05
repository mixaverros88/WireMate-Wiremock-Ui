/**
 * Tests for projectService — thin wrappers around the shared `request<T>` helper.
 *
 * The functions are simple, but they're the only places that own the
 * exact URL composition for the projects endpoint, and they were
 * rewritten when the service layer was consolidated. Pin the URL shapes
 * so a future refactor can't silently change them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createProject,
  deleteProject,
  fetchProject,
  fetchProjects,
  renameProject,
} from './projectService'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function ok(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function lastUrl(): string {
  return (fetch as any).mock.calls[(fetch as any).mock.calls.length - 1][0] as string
}
function lastInit(): RequestInit {
  return (fetch as any).mock.calls[(fetch as any).mock.calls.length - 1][1] as RequestInit
}

describe('projectService', () => {
  it('GET /api/projects', async () => {
    ;(fetch as any).mockResolvedValueOnce(ok([{ id: 'p1' }]))
    const result = await fetchProjects()
    expect(lastUrl()).toContain('/api/projects')
    expect(result).toEqual([{ id: 'p1' }])
  })

  it('GET /api/projects/:id', async () => {
    ;(fetch as any).mockResolvedValueOnce(ok({ id: 'p1', name: 'X' }))
    await fetchProject('p1')
    expect(lastUrl()).toMatch(/\/api\/projects\/p1$/)
  })

  it('DELETE /api/projects/:id', async () => {
    ;(fetch as any).mockResolvedValueOnce(new Response(null, { status: 204 }))
    await deleteProject('p1')
    expect(lastUrl()).toMatch(/\/api\/projects\/p1$/)
    expect(lastInit().method).toBe('DELETE')
  })

  it('PUT /api/projects/:id with { name }', async () => {
    ;(fetch as any).mockResolvedValueOnce(ok({ id: 'p1', name: 'new' }))
    await renameProject('p1', 'new')
    expect(lastInit().method).toBe('PUT')
    expect(JSON.parse(lastInit().body as string)).toEqual({ name: 'new' })
  })

  it('POST /api/projects with the create payload', async () => {
    ;(fetch as any).mockResolvedValueOnce(ok({ id: 'p2', name: 'New' }))
    await createProject({ name: 'New' })
    expect(lastInit().method).toBe('POST')
    expect(JSON.parse(lastInit().body as string)).toEqual({ name: 'New' })
  })

  it('surfaces backend error detail through the shared helper', async () => {
    ;(fetch as any).mockResolvedValueOnce(
      ok({ detail: 'Project name already exists' }, { status: 409 }),
    )
    await expect(createProject({ name: 'dup' })).rejects.toThrow(
      'Project name already exists',
    )
  })
})
