    # WireMate UI

WireMate is a visual management tool for WireMock. It provides a web-based interface for creating, organizing, and publishing WireMock stub mappings without writing JSON by hand.

## Tech Stack

- Vue 3 (Composition API + `<script setup>`)
- TypeScript
- Vite
- Tailwind CSS v4
- Vue Router
- Heroicons
- Chart.js + vue-chartjs (request-journal charts)
- mgv-backoffice component library (~40 shared components, composables, and utilities: `BaseAppLayout`, `BaseSidebar`, `BaseConfirmModal`, `BaseSpinner`, `BaseInput`, `BaseDropdown`, `useTheme`, `useToast`, formatters, and more)

## Features

- **Visual Mock Builder** - Create WireMock request/response mappings through an intuitive form with support for methods, URLs, headers, JSON bodies, delays, and more.
- **Project Management** - Organize mocks into projects with search, filtering, and inline rename.
- **CRUD Operations** - Add, edit, and delete mocks or projects.
- **Clone** - Duplicate any mock in one click.
- **Move Mocks** - Transfer mocks between projects.
- **Postman Import & Export** - Upload a Postman v2.x collection and turn each request into a mock in the selected project, or export a single mock or a whole project back out as a Postman collection.
- **Collision Warnings** - While creating or editing a mock, the form warns live when another mock in the same project already uses the URL or the name you are typing.
- **Deep-Link Shortcut** - The `/mock/:mockId` route resolves a bare mock id to its owning project and forwards to the canonical edit URL — useful for request-journal links and external tools.
- **One-Click Publish** - Push stubs directly to WireMock with instant feedback. All stubs are persisted in the database.
- **Sync Delta Notifications** - A background task detects differences between the database and WireMock. View deltas on the notifications page.
- **WireMock Stubs Viewer** - Browse all active stub mappings on the WireMock server with filtering.
- **Request Journal** - Inspect every request WireMock receives. Filter by method, URL, or status.
- **Near Misses** - Diagnose unmatched requests by viewing the closest matching stubs.
- **State Control** - Monitor WireMock server health and perform admin operations.
- **Dark & Light Theme** - Switch between themes with a single click.
- **Docker-Ready** - Spin up the entire stack with Docker Compose.

## Project Structure

```
src/
  App.vue            # Root - sidebar + router-view
  main.ts            # App bootstrap
  style.css          # Tailwind v4 entry (dark variant + mgv-backoffice @source)
  env.d.ts           # Vite/TS ambient types
  config.ts          # Centralized env config (API + WireMock admin URLs)
  components/        # Reusable components (AppSidebar, CreateMock, modals, etc.)
  composables/       # Vue composables (useMockValidation; useTheme comes from mgv-backoffice)
  router/            # Vue Router setup
  services/          # API service layers (project, mock, notification, stub, etc.)
  types/             # TypeScript interfaces matching backend DTOs
  utils/             # Helpers (cookies, logs links, Postman import/export)
  views/             # Page-level components (one per route)
```

## Getting Started

### Prerequisites

- Node.js 20+ (CI runs Node 20; the Docker image uses Node 26)
- npm

### Installation

```bash
npm install
```

### Configuration

The UI resolves its two URLs at startup in `src/config.ts`. First non-empty value wins:

1. **Runtime config** — `window.__APP_CONFIG__`, loaded from `/config.js` next to `index.html` (see `public/config.js`). In Docker, the repo-root `config.js.template` is env-substituted and mounted into the Nginx container, so the same image can point at any environment without a rebuild.
2. **Build-time env vars** — `VITE_WIREMOCK_ADMIN_URL` / `VITE_API_BASE_URL` from `.env` files, used by `npm run dev` and CI builds.
3. **Localhost defaults** — a local WireMock + Spring Boot stack.

For local development, set `VITE_*` vars in a `.env` file in the project root. The provided `.env` contains only the WireMock URL (the API base falls back to its localhost default):

```
VITE_WIREMOCK_ADMIN_URL=http://localhost:9000/__admin
```

To point at a different backend, also add `VITE_API_BASE_URL=http://localhost:8081`. That value is the backend origin **without** the `/api` suffix — the app appends `/api` itself, and `src/config.ts` strips a trailing `/api` with a console warning if you include it.

A `.env.local` (git-ignored, takes precedence over `.env` in Vite) is also present with the same WireMock URL — use it for personal overrides.

### Development

```bash
npm run dev
```

The dev server also proxies `/api` requests to `http://localhost:8081` (see `vite.config.ts`).

### Build

```bash
npm run build
```

This runs `vue-tsc -b` for type-checking, then produces a production bundle with Vite. To type-check only, run `npm run typecheck`.

### Preview Production Build

```bash
npm run preview
```

### All npm Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`vue-tsc -b`) + production build |
| `npm run preview` | Preview the production build locally |
| `npm run typecheck` | Type-check only, no build |
| `npm run lint` / `npm run lint:fix` | ESLint check / auto-fix |
| `npm run format` / `npm run format:check` | Prettier write / verify |
| `npm test` / `npm run test:watch` | Unit tests with Vitest (run / watch mode) |
| `npm run test:e2e` | End-to-end tests with Playwright (see `tests/README.md`) |
| `postinstall` | Runs `patch-package` automatically after `npm install` |

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `VITE_WIREMOCK_ADMIN_URL` | WireMock admin API base URL (includes `/__admin`) | `http://localhost:8080/__admin` |
| `VITE_API_BASE_URL` | WireMate Spring Boot backend origin, without `/api` (the app appends it) | `http://localhost:8081` |

`VITE_` variables are baked in at build time; a runtime `window.__APP_CONFIG__` from `/config.js` overrides them (see Configuration above). The defaults in this table are the code fallbacks in `src/config.ts` — the provided `.env` overrides the WireMock URL to port 9000 to match the Docker Compose stack.

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

## API Endpoints

The UI communicates with two backends:

**WireMate Backend** (configurable via `VITE_API_BASE_URL`):
- `GET/POST /api/projects` - List and create projects
- `GET/PUT/DELETE /api/projects/:id` - Get, rename, or delete a project
- `GET /api/mocks/projects/:projectId/exists/by-name|by-url` - Existence checks while editing
- `POST /api/mocks` - Create a mock
- `GET /api/mocks/:id` - Fetch a single mock by id
- `PUT /api/mocks/:id` - Update a mock
- `DELETE /api/mocks/:id` - Delete a mock
- `POST /api/mocks/:id/clone` - Clone a mock
- `PUT /api/mocks/:id/move` - Move a mock to another project
- `POST /api/mocks/:id/republish` - Republish a mock to WireMock
- `GET /api/backoffice/notifications` - Get sync delta notifications (paginated)
- `DELETE /api/backoffice/notifications[/:id]` - Delete one or all notifications

**WireMock Admin API** (configurable via `VITE_WIREMOCK_ADMIN_URL`):
- `/__admin/mappings` - Stub mappings (list, get, delete, delete-all)
- `/__admin/requests` - Request journal (list, delete, `/remove` by pattern)
- `/__admin/requests/unmatched/near-misses` - Near misses for unmatched requests
- `/__admin/reset` - Reset mappings and journal
- `/__admin/shutdown` - Shut down the WireMock server
- `/__admin/health` - Health check
- `/__admin/version` - Server version
