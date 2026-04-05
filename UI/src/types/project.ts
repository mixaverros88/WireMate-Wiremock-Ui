import type { MockResponse } from './mock'

export interface Project {
  id: string
  name: string
  mocks: MockResponse[]
  createdAt: string
  updatedAt: string
}

export interface CreateProjectRequest {
  name: string
}
