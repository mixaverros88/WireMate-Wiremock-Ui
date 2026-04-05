# WireMate Service

A Spring Boot REST API for managing WireMock stub mappings, organized by projects. WireMate lets you create, update,
clone, and move mock API definitions and automatically publishes them to a running WireMock instance. A scheduled
background task cross-checks the database against WireMock and surfaces any drift as notifications consumable by the
WireMate UI.

## Domain Model

- **Project** — a logical container (bucket) that groups related mocks belonging to the same context or service.
- **Mock** — the actual stub registered in WireMock. Each mock defines a request/response mapping and always belongs to
  a `Project`.
- **Notification** — a drift finding produced by the cross-check task (e.g. a mock that exists in Postgres but is
  missing from WireMock, or vice-versa).

## Tech Stack

- Java 25, Spring Boot 4.1.1
- PostgreSQL
- WireMock
- Maven
- Docker

## Prerequisites

- Java 25+
- PostgreSQL
- WireMock instance running

## Configuration

Configured via environment variables.

### Database

| Variable                     | Default     | Description                 |
|------------------------------|-------------|-----------------------------|
| `DB_HOST`                    | `localhost` | PostgreSQL host             |
| `DB_PORT`                    | `5432`      | PostgreSQL port             |
| `DB_NAME`                    | `wiremate`  | Database name               |
| `DB_USER`                    | `wiremate`  | Database username           |
| `DB_PASSWORD`                | `wiremate`  | Database password           |
| `DB_POOL_MAX`                | `10`        | Hikari max pool size        |
| `DB_POOL_MIN`                | `2`         | Hikari min idle connections |
| `DB_POOL_CONNECT_TIMEOUT_MS` | `5000`      | Hikari connection timeout   |

### Server

| Variable      | Default | Description      |
|---------------|---------|------------------|
| `SERVER_PORT` | `8081`  | Application port |

### WireMock Integration

| Variable                       | Default                 | Description                             |
|--------------------------------|-------------------------|-----------------------------------------|
| `APP_WIREMOCK_BASE_URL`        | `http://localhost:9000` | WireMock base URL (the Docker Compose stack maps WireMock to host port 9000) |
| `APP_WIREMOCK_MAIN_PATH`       | `/__admin/mappings`     | WireMock admin mappings path            |
| `APP_WIREMOCK_CONNECT_TIMEOUT` | `PT2S`                  | HTTP connect timeout (ISO-8601 duration) |
| `APP_WIREMOCK_READ_TIMEOUT`    | `PT5S`                  | HTTP read timeout (ISO-8601 duration)   |

### Cross-Check Task

| Variable                   | Default | Description                               |
|----------------------------|---------|-------------------------------------------|
| `APP_CROSS_CHECK_ENABLED`  | `true`  | Toggle the scheduled drift-detection task |
| `APP_CROSS_CHECK_INTERVAL` | `PT10S` | Run interval (ISO-8601 duration)          |

### CORS

| Variable           | Default                                                                                  | Description                        |
|--------------------|------------------------------------------------------------------------------------------|------------------------------------|
| `APP_CORS_ORIGINS` | `http://localhost:3000,http://localhost:5174,http://localhost:5173,http://localhost:9002` | Comma-separated allowed UI origins |

## Running

### Local

```bash
mvn spring-boot:run
```

### Docker

```bash
docker build -t wiremate-service .
docker run -p 8081:8081 -p 8000:8000 wiremate-service
```

The image starts a JDWP debug agent on container port 8000 by default (`suspend=n`, so startup is unaffected). Disable it with `-e JAVA_TOOL_OPTIONS=""`; in the compose stack it is published on host port 8002.

## API Endpoints

All endpoints are prefixed with `/api/`. Errors are returned as RFC 7807 `application/problem+json` payloads.

### Projects — `/api/projects`

| Method | Path                        | Status | Description                        |
|--------|-----------------------------|--------|------------------------------------|
| GET    | `/api/projects`             | 200    | List all projects (optional `sort` param, default `createdAt,desc`) |
| GET    | `/api/projects/{projectId}` | 200    | Get a project with its mocks       |
| POST   | `/api/projects`             | 201    | Create a new project               |
| PUT    | `/api/projects/{projectId}` | 200    | Update a project                   |
| DELETE | `/api/projects/{projectId}` | 204    | Delete a project and all its mocks |

### Mocks — `/api/mocks`

| Method | Path                                                         | Status | Description                                                |
|--------|--------------------------------------------------------------|--------|------------------------------------------------------------|
| POST   | `/api/mocks`                                                 | 201    | Create a mock (auto-published to WireMock)                 |
| GET    | `/api/mocks/{mockId}`                                        | 200    | Get a mock by id                                           |
| PUT    | `/api/mocks/{mockId}`                                        | 200    | Update a mock                                              |
| POST   | `/api/mocks/{mockId}/clone`                                  | 201    | Clone a mock within the same project                       |
| PUT    | `/api/mocks/{mockId}/move`                                   | 200    | Move a mock to a different project                         |
| POST   | `/api/mocks/{mockId}/republish`                              | 204    | Re-publish a mock to WireMock                              |
| DELETE | `/api/mocks/{mockId}`                                        | 204    | Delete a mock                                              |
| GET    | `/api/mocks/projects/{projectId}/exists/by-name?name={name}` | 200    | Check whether a mock with the given name exists in project |
| GET    | `/api/mocks/projects/{projectId}/exists/by-url?url={url}`    | 200    | Check whether a mock with the given URL exists in project  |

### Backoffice — `/api/backoffice`

| Method | Path                                             | Status | Description                                         |
|--------|--------------------------------------------------|--------|-----------------------------------------------------|
| GET    | `/api/backoffice/notifications`                  | 200    | Paginated list of drift notifications (`Page<...>`) |
| DELETE | `/api/backoffice/notifications/{notificationId}` | 204    | Delete a single notification                        |
| DELETE | `/api/backoffice/notifications`                  | 204    | Delete all notifications                            |

The notifications listing endpoint accepts the standard Spring `Pageable` query params (`page`, `size`, `sort`). Default
page size is `100`, hard-capped at `500`. Default sort is `createdAt`.

## Background Tasks

`CrossCheckTask` runs on a fixed interval (default every 10s, configurable via `APP_CROSS_CHECK_INTERVAL`) and diffs the
mocks stored in Postgres against the stubs registered in WireMock. Any mismatches — mocks present in the DB but missing
from WireMock, or stubs registered in WireMock with no matching DB record — are persisted as `Notification` rows and
exposed through `/api/backoffice/notifications`. The task can be disabled entirely by setting
`APP_CROSS_CHECK_ENABLED=false`.

## Project Structure

```
src/main/java/com/wire/mate/service/
├── config/         # Spring configuration (RestClient, properties, CORS, JSON helper)
├── controller/     # REST controllers (Project, Mock, Backoffice)
├── dto/            # Request/response records, grouped by domain
│   ├── mock/
│   ├── notification/
│   └── project/
├── entity/         # JPA entities (BaseEntity, Project, Notification)
│   └── mock/       # Mock entity + repository projections (MockIdProjectId)
├── exception/      # Domain exceptions + GlobalExceptionHandler (RFC 7807)
├── gateway/        # Outbound WireMock HTTP client
│   └── dto/        # WireMock admin-API wire-format DTOs
├── logic/          # Orchestration between domain services and gateway
├── repository/     # Spring Data JPA repositories
├── service/        # Transactional domain services
├── task/           # Scheduled jobs (CrossCheckTask)
├── util/           # Stateless helpers
└── ServiceApplication.java

src/main/resources/
├── application.properties
├── banner.txt      # Startup ASCII banner
└── db/migration/   # Flyway SQL migrations
```

## Development

### Build

```bash
mvn clean package
```

### Test

Unit tests only:

```bash
mvn test
```

Unit + integration tests (`*IT.java`, run by Failsafe — requires a running Docker daemon for Testcontainers):

```bash
mvn verify
```
