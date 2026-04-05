# CLAUDE.md — WireMate Service

## Project Overview
This is a backoffice service that expose APIs for the WireMate UI
- A `Project` is a logical container (bucket) that groups related mocks together. It allows users to organize and quickly access similar mocks belonging to the same context or service.
- A `Mock` is the actual stub registered in WireMock. Each mock defines a request/response mapping and always belongs to a parent `Project`.
- A scheduled task (`task/CrossCheckTask`) runs on a fixed interval (default every 10s, `app.cross-check.interval`) and diffs the mocks in Postgres against the stubs registered in WireMock. Drift findings (mock in DB but missing from WireMock, or vice-versa) are persisted as `Notification` rows and served to the UI via `/api/backoffice/notifications`. The task can be disabled with `app.cross-check.enabled=false`.

## Tech Stack
- JAVA 25
- Spring Boot 4.1.1
- Postgres

## Architecture

- Layered: Controller → Service → Repository, plus Gateway for WireMock HTTP calls
- DTOs are Java records with Jakarta validation annotations
- Entities extend `BaseEntity` (UUID id, `createdAt` timestamp) except `Notification` which uses `BIGSERIAL` (Long id)
- Entities have `toDto()` methods for conversion — no separate mapper classes
- Constructor injection everywhere, no `@Autowired`
- `@Transactional` on all service write methods; `@Transactional(readOnly = true)` on reads
- Domain exceptions are translated by `GlobalExceptionHandler` into RFC 7807 ProblemDetail responses (see `exception/` below — one checked gateway exception is handled locally instead)

## Folder Structure

Source root: `src/main/java/com/wire/mate/service/`

- `config/` — Spring `@Configuration` classes and infrastructure beans. Holds `MainConfig` (registers the WireMock `RestClient`, enables scheduling, enables `@ConfigurationProperties`, and declares the shared `ObjectMapper` bean), `WireMateProperties` (typed binding for `app.*` properties such as the WireMock base URL and timeouts), `CorsConfig` (CORS rules for the WireMate UI), and `JsonHelper` (thin Jackson wrapper used by `logic/WireMockService`).

- `controller/` — REST entry points under the `/api/` prefix. `ProjectController` exposes CRUD endpoints; `MockController` exposes CRUD, clone, move, republish, and existence-check (`exists/by-name`, `exists/by-url`) endpoints; `BackofficeController` exposes paginated reads and deletion (single and bulk) of `Notification`s produced by the cross-check task. Controllers stay thin: they delegate to services and rely on `@ResponseStatus` (no `ResponseEntity`).

- `dto/` — Inbound and outbound payloads as Java `record`s with Jakarta validation annotations. Organized by domain:
  - `dto/project/` — `CreateProjectRequest`, `UpdateProjectRequest`, `ProjectResponse`, `ProjectWithMocksResponse`.
  - `dto/mock/` — `CreateMockRequest`, `UpdateMockRequest`, `CloneMockRequest`, `MoveMockRequest`, `MockResponse`.
  - `dto/notification/` — `NotificationResponse` for the backoffice feed.

- `entity/` — JPA entities. `BaseEntity` defines the shared UUID id and `createdAt` column; `Project` and `Mock` extend it. `Notification` is the exception — it uses a `BIGSERIAL` (`Long`) primary key and does not extend `BaseEntity`. Entities own their `toDto()` conversion methods (no separate mapper layer). Domains with more than one persistence type get a sub-package: `entity/mock/` holds `Mock` plus the `MockIdProjectId` repository projection (see rule: entity-in-entity-package).

- `exception/` — Domain exceptions and the centralized error handler. The `RuntimeException`s `NotFoundExc` (→ 404), `BadRequestExc` (→ 400), and `InternalServerErrorExc` (→ 500) are translated by `GlobalExceptionHandler` into RFC 7807 `ProblemDetail` responses; `WireMockExc` extends `InternalServerErrorExc` and lands in the generic 500 handler. `WireMockNotFoundExe` is a **checked** exception thrown by the gateway and handled locally (caught and logged in `MockService.delete`) — it never reaches the advice.

- `gateway/` — Outbound HTTP integration with WireMock. `WireMockGateway` wraps the `RestClient` and exposes typed methods for creating, updating, deleting, fetching, and bulk-removing stubs.
  - `gateway/dto/` — DTOs that mirror the WireMock admin API wire format: `WiremockReq`, `MappingDto`, `RequestDto`, `ResponseDto`, `MatchDto`, `MetaDto`, `WireMockResponseDto`. Kept separate from `dto/` so the WireMock format never leaks into the public API.

- `logic/` — Orchestration helpers that sit between services and the gateway. `WireMockService` translates domain operations (publish/update/delete a stub, delete all stubs of a project by metadata) into `WireMockGateway` calls and is invoked by the domain services in `service/`.

- `repository/` — Spring Data JPA repositories (`ProjectRepository`, `MockRepository`, `NotificationRepository`). Extend `JpaRepository` and use derived query methods, with one exception: `MockRepository.existsByUrlAndProjectId` is a native SQL query over the JSONB request payload.

- `service/` — Transactional domain services. `ProjectService` and `MockService` enforce uniqueness (check-then-save) and persist via repositories. All WireMock calls go through `logic/WireMockService`: `MockService` publishes on create and clone, pushes stub updates (PUT) on update, move, and republish, and deletes the stub on delete; `ProjectService` makes no WireMock call on create, pushes stub updates on rename, and removes all project stubs (by metadata) on delete. `NotificationService` exposes paginated reads and deletion (single and bulk) for the backoffice. Write methods are `@Transactional`; reads are `@Transactional(readOnly = true)`.

- `task/` — Scheduled background jobs. `CrossCheckTask` runs on a fixed interval, diffs the mocks in Postgres against the stubs registered in WireMock, and persists drift findings as `Notification` rows. Gated by the `app.cross-check.enabled` property (default on).

- `util/` — Stateless helpers with no Spring dependencies. Currently `Util` (WireMock metadata maps, URL-key helpers, first-path-segment rewriting for URLs and cURL commands, project-name slugification).

- `ServiceApplication.java` — Spring Boot entry point (`@SpringBootApplication`).

Other top-level locations:

- `src/main/resources/` — `application.properties`, `banner.txt`, and `db/migration/` (Flyway SQL migrations, e.g. `V1__create_initial_schema.sql`).
- `src/test/` — 15 test classes: 10 unit-test classes mirroring the main packages, plus 5 Testcontainers integration tests (`*IT.java` under `integration/`, extending `IntegrationTestBase`) and `application-test.properties`.
- `.claude/` — Project-specific Claude assets: coding `rules/`, helper `scripts/`, custom `agents/`, `skills/` (flyway-migration, integration-test, prod-triage, spring-endpoint, wiremock-stub), and settings files.
- `.run/` — IntelliJ run configurations (Build Image, Run Local, Set Up).
- `target/` — Maven build output (ignored).
- `Dockerfile`, `pom.xml`, `README.md` — build, dependency, and project documentation at the service module root (`service/`); the repository root has its own `README.md` and `docker-compose.yml`.

## Key Conventions

- REST endpoints live under `/api/` prefix
- Request DTOs: `Create*Request`, `Update*Request`, `Clone*Request`, `Move*Request`
- Response DTOs: `*Response` records
- Repositories: extend `JpaRepository`, use derived query methods
- Unique constraints enforced at both DB and service level (check-then-save pattern)
- Mocks are auto-published to WireMock on create and clone; update, move, and republish push stub updates (PUT)
- Scheduled task in `task/CrossCheckTask.java` detects DB↔WireMock drift every 10s and saves findings as `Notification` entities (detect-only — it never reconciles)
- `Notification` entity uses `BIGSERIAL` primary key (not UUID) — does not extend `BaseEntity`

## Testing and Quality
Before considering a task complete:
- mvn clean verify (runs unit tests via Surefire and `*IT.java` integration tests via Failsafe; the ITs need a running Docker daemon for Testcontainers)

Testing rules:
- add unit tests for reusable logic

## Safety Rules
- Do not rename public API routes unless explicitly requested
- Do not change database schema without calling it out clearly
- Do not modify auth flows unless the task requires it
- Flag major architectural changes before implementing them

## Commands

- Build: `mvn clean package`
- Run: `mvn spring-boot:run`
- Test (unit): `mvn test`
- Test (unit + integration): `mvn verify`
- Docker: `docker build -t wiremate-service .` (image enables a JDWP debug agent on container port 8000 by default — disable with `JAVA_TOOL_OPTIONS=""`; compose publishes it as host 8002)
- App runs on port 8081 by default, WireMock expected at `http://localhost:9000` (override with `APP_WIREMOCK_BASE_URL`)
