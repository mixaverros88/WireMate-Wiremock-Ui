## Integration Testing

- ALWAYS use Testcontainers for integration tests. NEVER use H2 or any other
  in-memory database as a substitute for the real database.
- Integration tests must run against the same database engine and major version
  used in production (e.g. `postgres:16-alpine`).
- Use `@ServiceConnection` (Spring Boot 3.1+) to wire containers instead of
  manually setting `spring.datasource.*` properties via `@DynamicPropertySource`.
- Define containers as static, reusable singletons in a shared base class
  (e.g. `AbstractIntegrationTest`) so the container starts once per test run,
  not once per test class.
- Do NOT add `com.h2database:h2` as a dependency. If it exists in the project,
  do not use it in new tests, and flag it for removal.
- `spring.jpa.hibernate.ddl-auto` in tests should match how schema is managed
  in production (Flyway/Liquibase migrations), not `create-drop`. Migrations
  must run against the Testcontainers database so they are tested too.
- For other infrastructure (Kafka, Redis, Elasticsearch, etc.), also use
  Testcontainers modules rather than embedded/in-memory fakes.
- Annotate integration tests with `@SpringBootTest` + `@Testcontainers`, and
  keep them separate from unit tests (e.g. `*IT` naming or a `integrationTest`
  source set) so unit tests stay fast.