import type { Project, CreateProjectRequest } from '../types/project'
import { API_URL } from '../config'
import { request } from './http'

const BASE_URL = `${API_URL}/projects`

export function fetchProjects(): Promise<Project[]> {
  return request<Project[]>(BASE_URL, {
    errorFallback: 'Failed to fetch projects',
  })
}

export function fetchProject(id: string): Promise<Project> {
  return request<Project>(`${BASE_URL}/${id}`, {
    errorFallback: 'Failed to fetch project',
  })
}

export function deleteProject(id: string): Promise<void> {
  return request<void>(`${BASE_URL}/${id}`, {
    method: 'DELETE',
    errorFallback: 'Failed to delete project',
  })
}

/**
 * Rename an existing project. Hits PUT /api/projects/{id} with the
 * standard `{ name }` payload — same shape the create endpoint takes —
 * so the backend can reuse its name-uniqueness check. On any non-OK
 * status the shared request helper surfaces the backend's
 * ProblemDetail `detail` text so duplicate-name and validation errors
 * show the actual reason in the inline message instead of a generic
 * "Failed to rename project" toast.
 */
export function renameProject(id: string, name: string): Promise<Project> {
  return request<Project>(`${BASE_URL}/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
    errorFallback: 'Failed to rename project',
  })
}

export function createProject(payload: CreateProjectRequest): Promise<Project> {
  return request<Project>(BASE_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
    errorFallback: 'Failed to create project',
  })
}
