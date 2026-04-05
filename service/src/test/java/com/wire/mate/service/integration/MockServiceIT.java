package com.wire.mate.service.integration;

import com.wire.mate.service.dto.mock.CreateMockRequest;
import com.wire.mate.service.dto.mock.MoveMockRequest;
import com.wire.mate.service.entity.mock.Mock;
import com.wire.mate.service.entity.Project;
import com.wire.mate.service.exception.WireMockExc;
import com.wire.mate.service.logic.WireMockService;
import com.wire.mate.service.repository.MockRepository;
import com.wire.mate.service.repository.ProjectRepository;
import com.wire.mate.service.service.MockService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

class MockServiceIT extends IntegrationTestBase {

    @Autowired MockService mockService;
    @Autowired MockRepository mockRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired TransactionTemplate txTemplate;

    @MockitoBean WireMockService wireMockService;

    @BeforeEach
    void cleanDb() {
        jdbcTemplate.execute("TRUNCATE TABLE mocks, projects RESTART IDENTITY CASCADE");
    }

    private Project newProject(String name) {
        return projectRepository.saveAndFlush(new Project(name));
    }

    private CreateMockRequest createReq(UUID projectId, String name, Map<String, Object> request) {
        return new CreateMockRequest(
                name, "desc", projectId, request,
                new HashMap<>(Map.of("status", 200)),
                false, 5, new HashMap<>(), List.of(), "curl");
    }

    @Test
    @DisplayName("existsByUrlInProject matches urlPath JSONB column")
    void urlPathBranch() {
        var p = newProject("p");
        mockService.create(createReq(p.getId(), "m1",
                new HashMap<>(Map.of("urlPath", "/api/users"))));

        assertThat(mockService.existsByUrlInProject(p.getId(), "/api/users")).isTrue();
        assertThat(mockService.existsByUrlInProject(p.getId(), "/missing")).isFalse();
    }

    @Test
    @DisplayName("existsByUrlInProject matches url JSONB column as alternative")
    void urlBranch() {
        var p = newProject("p");
        mockService.create(createReq(p.getId(), "m1",
                new HashMap<>(Map.of("url", "/api/legacy"))));

        assertThat(mockService.existsByUrlInProject(p.getId(), "/api/legacy")).isTrue();
    }

    @Test
    @DisplayName("JSONB columns round-trip nested structures incl. metadata and listeners")
    void jsonbRoundTrip() {
        var p = newProject("p");
        var listener = new HashMap<String, Object>();
        listener.put("name", "webhook");
        listener.put("parameters", Map.of("url", "http://x"));
        var meta = new HashMap<String, Object>();
        meta.put("nested", Map.of("k", List.of(1, 2, 3)));
        var req = new CreateMockRequest(
                "m1", "d", p.getId(),
                new HashMap<>(Map.of("urlPath", "/x", "method", "GET")),
                new HashMap<>(Map.of("status", 200, "body", "ok")),
                true, 1, meta, List.of(listener), "curl");

        var saved = mockService.create(req);
        var loaded = mockRepository.findById(saved.id()).orElseThrow();

        assertThat(loaded.getRequestDefinition()).containsEntry("method", "GET");
        assertThat(loaded.getResponseDefinition()).containsEntry("body", "ok");
        assertThat(loaded.getMetadata()).containsKey("nested");
        assertThat(loaded.getServeEventListeners()).hasSize(1);
    }

    @Test
    @DisplayName("move with name collision in target persists suffixed name")
    void moveCollisionSuffix() {
        var src = newProject("src");
        var dst = newProject("dst");

        mockService.create(createReq(src.getId(), "shared",
                new HashMap<>(Map.of("urlPath", "/a"))));
        mockService.create(createReq(dst.getId(), "shared",
                new HashMap<>(Map.of("urlPath", "/b"))));

        var srcMock = mocksIn(src.getId()).get(0);

        mockService.move(srcMock.getId(), new MoveMockRequest(dst.getId()));

        var inDst = mocksIn(dst.getId());
        assertThat(inDst).hasSize(2);
        assertThat(inDst).extracting(Mock::getName)
                .anyMatch(n -> n.startsWith("shared ")
                        && n.contains("(the uuid added to by pass the name collision)"));
    }

    @Test
    @DisplayName("move to same project is a no-op — the persisted name is unchanged")
    void moveToSameProjectIsNoOp() {
        var p = newProject("p");
        var saved = mockService.create(createReq(p.getId(), "stable",
                new HashMap<>(Map.of("urlPath", "/x"))));

        mockService.move(saved.id(), new MoveMockRequest(p.getId()));

        var reloaded = mockRepository.findById(saved.id()).orElseThrow();
        assertThat(reloaded.getName()).isEqualTo("stable");
        assertThat(reloaded.getProject().getId()).isEqualTo(p.getId());
    }

    @Test
    @DisplayName("clone produces an independent persisted row with the requested name")
    void cloneRoundTrip() {
        var p = newProject("p");
        var srcResp = mockService.create(createReq(p.getId(), "orig",
                new HashMap<>(Map.of("urlPath", "/x", "method", "GET"))));

        mockService.clone(srcResp.id(), new com.wire.mate.service.dto.mock.CloneMockRequest("copy"));

        var rows = mocksIn(p.getId());
        assertThat(rows).hasSize(2);
        assertThat(rows).extracting(Mock::getName).containsExactlyInAnyOrder("orig", "copy");
        assertThat(rows).extracting(Mock::getId).doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("delete rolls back DB removal when WireMockService.deleteStub throws WireMockExc")
    void deleteRollsBackOnGenericWireMockFailure() throws Exception {
        var p = newProject("p");
        var saved = mockService.create(createReq(p.getId(), "m",
                new HashMap<>(Map.of("urlPath", "/x"))));

        doThrow(new WireMockExc("boom", new RuntimeException()))
                .when(wireMockService).deleteStub(any(UUID.class));

        assertThatThrownBy(() ->
                txTemplate.executeWithoutResult(s -> mockService.delete(saved.id())))
                .isInstanceOf(WireMockExc.class);

        assertThat(mockRepository.existsById(saved.id())).isTrue();
    }

    private List<Mock> mocksIn(UUID projectId) {
        return mockRepository.findAll().stream()
                .filter(m -> m.getProject().getId().equals(projectId))
                .toList();
    }
}
