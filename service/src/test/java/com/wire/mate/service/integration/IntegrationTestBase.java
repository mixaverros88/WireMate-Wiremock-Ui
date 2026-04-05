package com.wire.mate.service.integration;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Shared base for all integration tests.
 *
 * <p>The Postgres container is a static singleton so it is started once for the whole
 * test suite — Testcontainers tracks it and does not restart between {@code @SpringBootTest}
 * classes. Spring Boot's {@link ServiceConnection} wires {@code spring.datasource.*} to it.
 * Flyway runs against the container; Hibernate ddl-auto=none, matching production config.
 */
@Testcontainers
@ActiveProfiles("test")
@SpringBootTest
public abstract class IntegrationTestBase {

    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("wiremate")
                    .withUsername("wiremate")
                    .withPassword("wiremate")
                    .withReuse(true);

    static {
        POSTGRES.start();
    }
}
