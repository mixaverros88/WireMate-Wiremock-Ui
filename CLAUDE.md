# WireMate

## Project Overview

WireMate is a backoffice system for WireMock. It lets users create, persist, and publish WireMock stubs to a running WireMock server through a guided web UI. Users can organise mocks into projects, clone and move them between projects, and monitor activity via an in-app notification system.

## Core Workflow

1. User opens the backoffice UI
2. User creates or selects a project
3. User constructs a WireMock mapping (request/response JSON) via the UI
4. On save, the mapping is persisted to the database and published to the WireMock server
5. User can clone, move, or re-publish mocks at any time

## Tech Stack

- **Backend** — Java 25, Spring Boot 4.1.0, Spring Data JPA, PostgreSQL (JSONB), Maven
- **Frontend** — Vue 3.5, TypeScript 6.0, Vite 8, Tailwind CSS 4, mgv-backoffice component library
- **Infrastructure** — Docker & Docker Compose, Nginx (production UI), WireMock 3.13.2

## Infrastructure

- PostgreSQL 17 (Alpine) — port 5432, user `wiremate`, db `wiremate`
- WireMock 3.13.2 — host port 9000 (container port 8080, see `WIREMOCK_PORT` in `.env`)
- Backend API — host port 9001 in Docker (container port 8081, see `BACKEND_PORT` in `.env`); port 8081 when run locally (code in `/service`)
- Frontend (dev) — port 5173 (code in `/UI`)
- Frontend (Docker/production) — host port 9002 via Nginx (container port 80, see `UI_PORT` in `.env`)

## WireMock Mapping Example

The UI builds JSON payloads like the following and sends them to the backend, which persists them and publishes them to WireMock's admin endpoint:

```json
{
  "request": {
    "method": "POST",
    "url": "/interaction/v1/events"
  },
  "response": {
    "status": 201,
    "jsonBody": {},
    "headers": {
      "Content-Type": "application/json"
    },
    "delayDistribution": {
      "type": "uniform",
      "lower": 60,
      "upper": 80
    }
  },
  "persistent": true
}
```

## API Endpoints

### Projects — `/api/projects`

- `GET /` — list all projects
- `GET /:projectId` — get a project with its mocks
- `POST /` — create a project
- `PUT /:projectId` — update a project
- `DELETE /:projectId` — delete a project

### Mocks — `/api/mocks`

- `POST /` — create a mock (auto-publishes to WireMock)
- `GET /:mockId` — get mock details
- `PUT /:mockId` — update a mock
- `GET /projects/:projectId/exists/by-name?name=` — check if a mock name exists in a project
- `GET /projects/:projectId/exists/by-url?url=` — check if a mock URL exists in a project
- `POST /:mockId/clone` — clone a mock
- `PUT /:mockId/move` — move a mock to another project
- `DELETE /:mockId` — delete a mock
- `POST /:mockId/republish` — manually republish a mock to WireMock

### Backoffice — `/api/backoffice`

- `GET /notifications` — retrieve system notifications (paginated, sorted by `createdAt`)
- `DELETE /notifications/:notificationId` — delete a notification
- `DELETE /notifications` — delete all notifications

## Project Structure

```
WireMate/
├── service/                    # Spring Boot backend
│   └── src/main/java/com/wire/mate/service/
│       ├── config/             # REST client configuration
│       ├── controller/         # REST controllers (Project, Mock, Backoffice)
│       ├── dto/                # Request/response records
│       ├── entity/             # JPA entities (Project, Mock, Notification)
│       ├── exception/          # Global error handling & custom exceptions
│       ├── gateway/            # WireMock REST client
│       ├── logic/              # WireMockService — orchestration between services and gateway
│       ├── repository/         # Spring Data repositories
│       ├── service/            # Business logic
│       ├── task/               # Scheduled tasks
│       └── util/               # Stateless helpers
├── UI/                         # Vue 3 frontend
│   └── src/
│       ├── config.ts           # Centralized runtime/env config (API + WireMock admin URLs)
│       ├── components/         # Reusable components (sidebar, modals, mock-form sections, etc.)
│       ├── composables/        # Vue composables (mock validation; theme comes from mgv-backoffice)
│       ├── utils/              # Helpers (cookies, logs links, Postman import/export)
│       ├── services/           # API clients (mock, project, notification, request journal, state control, stub)
│       ├── types/              # TypeScript type definitions
│       ├── views/              # Page components
│       └── router/             # Vue Router config
└── docker-compose.yml
```

## Configuration

Environment variables (with defaults from `application.properties`):

| Variable            | Default                 | Description         |
|---------------------|-------------------------|---------------------|
| `DB_HOST`           | `localhost`             | PostgreSQL host     |
| `DB_PORT`           | `5432`                  | PostgreSQL port     |
| `DB_NAME`           | `wiremate`              | Database name       |
| `DB_USER`           | `wiremate`              | Database user       |
| `DB_PASSWORD`       | `wiremate`              | Database password   |
| `DB_POOL_MAX`       | `10`                    | Hikari pool max size |
| `DB_POOL_MIN`       | `2`                     | Hikari pool min idle |
| `DB_POOL_CONNECT_TIMEOUT_MS` | `5000`         | Hikari connection timeout (ms) |
| `SERVER_PORT`       | `8081`                  | Backend API port    |
| `APP_WIREMOCK_BASE_URL` | `http://localhost:9000` | WireMock server URL |
| `APP_WIREMOCK_MAIN_PATH` | `/__admin/mappings` | WireMock admin mappings path |
| `APP_WIREMOCK_CONNECT_TIMEOUT` | `PT2S`       | WireMock client connect timeout |
| `APP_WIREMOCK_READ_TIMEOUT` | `PT5S`          | WireMock client read timeout |
| `APP_CROSS_CHECK_INTERVAL` | `PT10S`          | Cross-check task interval |
| `APP_CROSS_CHECK_ENABLED` | `true`            | Enable/disable the cross-check task |

### CORS

| Variable           | Default                                                                                        | Description                        |
|--------------------|------------------------------------------------------------------------------------------------|------------------------------------|
| `APP_CORS_ORIGINS` | `http://localhost:3000,http://localhost:5174,http://localhost:5173,http://localhost:9002`       | Comma-separated allowed UI origins |
