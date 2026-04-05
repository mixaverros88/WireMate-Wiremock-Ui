/// <reference types="vite/client" />

// Injected at build time by Vite's `define` option (see vite.config.ts).
declare const __APP_VERSION__: string

// Runtime config exposed by /public/config.js — see src/config.ts.
// Loaded by a `<script src="/config.js">` tag in index.html before the
// app bundle, so the values are available on `window.__APP_CONFIG__`
// the moment Vue boots. All keys are optional; missing keys fall back
// to VITE_* env vars and then to localhost defaults.
interface AppRuntimeConfig {
  WIREMOCK_ADMIN_URL?: string
  API_BASE_URL?: string
}

interface Window {
  __APP_CONFIG__?: AppRuntimeConfig
}
