# CLAUDE.md - WireMate UI

## Project Overview

WireMate UI is a Vue 3 + TypeScript frontend for managing WireMock stub mappings. It connects to a Spring Boot backend (`/api`) and directly to the WireMock admin API.

## Build & Run

```bash
npm install          # Install dependencies (postinstall runs patch-package)
npm run dev          # Start dev server (Vite)
npm run build        # Type-check + production build
npm run typecheck    # Type-check only (vue-tsc -b, no build)
npm run lint         # ESLint (lint:fix to auto-fix)
npm run format       # Prettier (format:check to verify)
npm test             # Unit tests, Vitest (test:watch for watch mode)
npm run test:e2e     # E2E tests, Playwright (see tests/README.md)
```

## Architecture

- **Framework:** Vue 3 Composition API with `<script setup>` and TypeScript
- **Build:** Vite. Config is resolved at runtime in `src/config.ts`: `window.__APP_CONFIG__` (from `/config.js`, templated in Docker) first, then build-time `VITE_*` env vars, then localhost defaults
- **Styling:** Tailwind CSS v4, dark mode via the `useTheme()` composable from mgv-backoffice (`isDark` ref)
- **Components:** mgv-backoffice library (BaseButton, BaseSpinner, BaseToast, BaseAlert, BaseInput, BaseDropdown, BaseSegmentedControl, BaseNotificationPanel, …). Newer components style dark mode with Tailwind `dark:` variants — `src/style.css` maps that variant to the `.dark` class via `@custom-variant` and scans the lib dist via `@source`.
- **Icons:** @heroicons/vue (v24/outline)
- **Routing:** Vue Router, all routes in `src/router/index.ts`
- **HTTP:** Fetch API (no axios)

## Key Patterns

- **Services** are in `src/services/`, each with a `BASE_URL` and async fetch functions
- **Types** are in `src/types/`, matching backend DTOs
- **Dark mode** uses the `useTheme()` composable (from mgv-backoffice), classes applied conditionally via `:class="isDark ? ... : ..."`
- **Modals** — confirmation and text-input dialogs come from mgv-backoffice (`BaseConfirmModal`, `BaseTextInputModal`); local modals (`MoveModal`, `SelectProjectModal`) use `defineExpose({ submitting })` for parent-controlled loading state
- **Config** is centralized in `src/config.ts`: `WIREMOCK_ADMIN_URL` and `API_BASE_URL`, each resolved `window.__APP_CONFIG__` → `VITE_*` env var → localhost default; `API_URL` is derived as `${API_BASE_URL}/api` (a trailing `/api` in config is stripped with a warning)
- **Sidebar** (`AppSidebar.vue`) is a thin wrapper over mgv-backoffice's `BaseSidebar` — it supplies nav sections, the WireMock health pill (polls `GET /__admin/health`), the build-time app version, the GitHub footer link, and the notification bell; responsive behavior lives in the library

## File Layout

```
src/
  App.vue                          # Root - sidebar + router-view
  main.ts                          # App bootstrap
  style.css                        # Tailwind v4 entry (dark variant + lib @source)
  env.d.ts                         # Vite/TS ambient types
  config.ts                        # Centralized runtime/env config
  components/
    AppSidebar.vue                 # Main navigation sidebar (wraps BaseSidebar)
    CreateMock.vue                 # Large mock creation form
    ImportPostmanModal.vue         # Postman v2.x collection import modal
    LandingPage.vue                # Presentation / landing page
    MockActions.vue                # Per-mock action buttons (edit, clone, move, delete, republish)
    MoveModal.vue                  # Move mock between projects modal
    RequestDetailModal.vue         # Request journal detail modal
    SelectProjectModal.vue         # Project picker modal
    WireMateLogo.vue               # SVG logo component
    mock-form/                     # CreateMock sub-sections: BasicAuthSection, ChunkedDribbleSection,
                                   #   FaultSimulationSection, ProxyingSection, WebhooksSection
  views/
    ProjectsView.vue               # Projects list
    ProjectDetailView.vue          # Single project + mocks list
    CreateProjectView.vue          # Create project form
    CreateMockView.vue             # Standalone mock creation page
    EditMockView.vue               # Edit existing mock
    MockRedirectView.vue           # Resolves /mock/:mockId to the canonical edit URL
    NotificationsView.vue          # Sync delta notifications list
    RequestJournalView.vue         # WireMock request journal (logs)
    SettingsView.vue               # WireMock admin operations & server health
    NearMissesView.vue             # Near miss request diagnostics
    StubsView.vue                  # WireMock stubs viewer
    StubDetailView.vue             # Single stub detail
    NotFoundView.vue               # 404 page
  services/
    api.ts                         # mockApi — single client for /api/mocks (CRUD, clone, move, republish, existence checks)
    mockService.ts                 # Legacy shim re-exporting mockApi as free functions; prefer mockApi in new code
    projectService.ts              # Projects: fetch, create, rename, delete
    notificationService.ts         # Notifications: paginated fetch + delete (single/all)
    stubService.ts                 # WireMock stubs API
    requestJournalService.ts       # WireMock request journal API
    settingsService.ts             # WireMock admin ops (near-misses, reset, shutdown, health, version)
    http.ts                        # Generic fetch request helper (request / requestNoBody)
    errors.ts                      # API error extraction and mapping
  types/
    project.ts, mock.ts, notification.ts, requestJournal.ts, settings.ts, nearMisses.ts
  router/
    index.ts                       # All routes (sole routing file)
  composables/
    useMockValidation.ts           # Mock form validation (useTheme comes from mgv-backoffice)
  utils/
    cookies.ts, logsLink.ts, postmanImport.ts, postmanExport.ts
    (sanitizeHtml.spec.ts has no sibling source on purpose — it regression-tests
     the sanitizeHtml util imported from mgv-backoffice)
```

## Routes

| Path | Name | Component |
|---|---|---|
| `/` | - | Redirects to `/projects` |
| `/presentation` | presentation | LandingPage (no sidebar) |
| `/projects` | projects | ProjectsView |
| `/projects/:id` | project | ProjectDetailView |
| `/create-project` | create-project | CreateProjectView |
| `/mocks/create` | create-mock | CreateMockView |
| `/projects/:id/mocks/:mockId/edit` | edit-mock | EditMockView |
| `/mock/:mockId` | mock-redirect | MockRedirectView (deep-link shortcut) |
| `/logs` | logs | RequestJournalView |
| `/settings` | settings | SettingsView |
| `/stubs` | stubs | StubsView |
| `/stubs/:id` | stub-detail | StubDetailView |
| `/notifications` | notifications | NotificationsView |
| `/near-misses` | near-misses | NearMissesView |
| `/:pathMatch(.*)*` | not-found | NotFoundView |

## Mock Form Section Order

General > Metadata > Request Matching > Response Definition > Cookies > Basic Authentication > Chunked Dribble Delay > Fault Simulation > Proxying > Webhooks / Post-Serve Actions
