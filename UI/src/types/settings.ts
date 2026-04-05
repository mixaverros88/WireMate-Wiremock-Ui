// DelayDistribution is the same shape as in ./mock.ts - they describe the
// same WireMock concept. Re-export so there's a single source of truth.
import type { DelayDistribution } from './mock'
export type { DelayDistribution }

export interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  message: string
  version: string
  uptimeInSeconds: number
  timestamp: string
}

export interface VersionResponse {
  version: string
}
