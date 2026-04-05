package com.wire.mate.service.integration;

import com.wire.mate.service.entity.mock.Mock;
import com.wire.mate.service.entity.Project;
import com.wire.mate.service.gateway.WireMockGateway;
import com.wire.mate.service.repository.MockRepository;
import com.wire.mate.service.repository.NotificationRepository;
import com.wire.mate.service.repository.ProjectRepository;
import com.wire.mate.service.task.CrossCheckTask;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Cross-check IT — real Postgres, mocked WireMock gateway. The interval is pushed out
 * so the {@link org.springframework.scheduling.annotation.Scheduled} cadence cannot
 * fire during the test; we invoke {@code execute()} directly.
 */
@TestPropertySource(properties = {
        "app.cross-check.enabled=true",
        "app.cross-check.interval=PT24H"
})
class CrossCheckTaskIT extends IntegrationTestBase {

    @Autowired CrossCheckTask task;
    @Autowired ProjectRepository projectRepository;
    @Autowired MockRepository mockRepository;
    @Autowired NotificationRepository notificationRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    @MockitoBean WireMockGateway wireMockGateway;

    @BeforeEach
    void cleanDb() {
        jdbcTemplate.execute("TRUNCATE TABLE notifications, mocks, projects RESTART IDENTITY CASCADE");
    }

    private Mock seedMock(Project p, String name) {
        return mockRepository.saveAndFlush(new Mock(
                name, "d", p,
                new HashMap<>(Map.of("urlPath", "/" + name)),
                new HashMap<>(Map.of("status", 200)),
                false, 5, new HashMap<>(), List.of(), "c"));
    }

    @Test
    @DisplayName("perfectly aligned DB and WireMock: zero notifications saved")
    void aligned() {
        var p = projectRepository.saveAndFlush(new Project("p"));
        var m = seedMock(p, "a");
        when(wireMockGateway.getAllMappingIds()).thenReturn(Set.of(m.getId().toString()));

        task.execute();

        assertThat(notificationRepository.count()).isZero();
    }

    @Test
    @DisplayName("DB has extras and WireMock has extras: notification per side")
    void bidirectional() {
        var p = projectRepository.saveAndFlush(new Project("p"));
        var a = seedMock(p, "a");
        var b = seedMock(p, "b");
        var orphanWmId = UUID.randomUUID().toString();

        when(wireMockGateway.getAllMappingIds())
                .thenReturn(Set.of(a.getId().toString(), orphanWmId));

        task.execute();

        var all = notificationRepository.findAll();
        assertThat(all).hasSize(2);
        assertThat(all).extracting("name")
                .anyMatch(n -> ((String) n).contains(b.getId().toString())
                        && ((String) n).contains("is in WireMate but not in WireMock"))
                .anyMatch(n -> ((String) n).contains(orphanWmId)
                        && ((String) n).contains("is in WireMock but not in WireMate"));
    }
}
