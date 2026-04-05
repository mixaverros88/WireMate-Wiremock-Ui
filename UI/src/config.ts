// =============================================================
//  Application config — resolved at runtime.
//
//  Resolution order (first non-empty value wins):
//    1. window.__APP_CONFIG__  → loaded from /public/config.js,
//       served as a sibling of index.html. Operators can mount a
//       different config.js into the container at runtime to
//       point the same image at different environments.
//    2. import.meta.env.VITE_* → set in `.env` files, used by
//       `npm run dev` and CI builds where the value is known
//       ahead of time.
//    3. localhost defaults — the dev server pointing at a local
//       WireMock + Spring Boot stack.
// =============================================================

interface RuntimeConfig {
  WIREMOCK_ADMIN_URL?: string
  API_BASE_URL?: string
}

const runtimeConfig: RuntimeConfig =
  (typeof window !== 'undefined' && window.__APP_CONFIG__) || {}

function pick(runtime: string | undefined, viteEnv: string | undefined, fallback: string): string {
  const r = (runtime ?? '').trim()
  if (r) return r
  const v = (viteEnv ?? '').trim()
  if (v) return v
  return fallback
}

// Strip every trailing slash from a URL. We never want a runtime config
// value to cause `/foo//bar` because someone added a trailing slash by
// muscle memory.
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

// Idempotent suffix strip. If the URL ends with the given path segment
// (after slash normalisation), strip it AND warn so the operator
// notices their config is duplicating the suffix the app already
// appends. Returns the cleaned URL either way so the app keeps
// working — this is forgiveness, not enforcement.
function stripSuffix(url: string, suffix: string, varName: string): string {
  const cleaned = stripTrailingSlash(url)
  const lower = cleaned.toLowerCase()
  const lowerSuffix = suffix.toLowerCase()
  if (lower.endsWith(lowerSuffix)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[config] ${varName}="${url}" already ends with "${suffix}". The app appends `
      + `"${suffix}" itself, so the trailing segment was stripped to avoid a doubled `
      + `path. Update your config.js to remove the "${suffix}" suffix.`,
    )
    return cleaned.slice(0, -suffix.length)
  }
  return cleaned
}

// WireMock admin endpoint. Should include the `/__admin` suffix —
// WireMock binds its admin routes there and we POST stub mappings,
// scenarios, etc. directly to URLs under it.
export const WIREMOCK_ADMIN_URL = stripTrailingSlash(pick(
  runtimeConfig.WIREMOCK_ADMIN_URL,
  import.meta.env.VITE_WIREMOCK_ADMIN_URL as string | undefined,
  'http://localhost:8080/__admin',
))

// Base URL of the WireMock service where mocks are actually served
// (admin URL without the /__admin suffix).
export const WIREMOCK_BASE_URL = WIREMOCK_ADMIN_URL.replace(/\/__admin$/, '')

// Host of the WireMate Spring Boot backend (scheme + authority only,
// no trailing path). Operators set this from /config.js to point the
// UI at staging / prod without rebuilding the image.
//
// Defensively strips:
//   • trailing slashes — `http://host:8081/` → `http://host:8081`
//   • a trailing `/api` — keeps legacy configs working (with a
//     console.warn) since the app appends `/api` itself further down.
export const API_BASE_URL = stripSuffix(
  pick(
    runtimeConfig.API_BASE_URL,
    import.meta.env.VITE_API_BASE_URL as string | undefined,
    'http://localhost:8081',
  ),
  '/api',
  'API_BASE_URL',
)

// REST API root — `${API_BASE_URL}/api`. Services should import this
// and concatenate the resource path on the right (e.g. `${API_URL}/mocks`).
// Kept derived rather than configurable because the backend's `/api`
// prefix is fixed by the Spring controller mappings.
export const API_URL = `${API_BASE_URL}/api`
