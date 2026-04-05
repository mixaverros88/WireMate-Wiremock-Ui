package com.wire.mate.service.integration;

import com.wire.mate.service.dto.project.CreateProjectRequest;
import com.wire.mate.service.dto.project.UpdateProjectRequest;
import com.wire.mate.service.entity.mock.Mock;
import com.wire.mate.service.entity.Project;
import com.wire.mate.service.exception.BadRequestExc;
import com.wire.mate.service.exception.WireMockExc;
import com.wire.mate.service.logic.WireMockService;
import com.wire.mate.service.repository.MockRepository;
import com.wire.mate.service.repository.ProjectRepository;
import com.wire.mate.service.service.ProjectService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
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
import static org.mockito.Mockito.verify;

class ProjectServiceIT extends IntegrationTestBase {

    @Autowired ProjectService projectService;
    @Autowired ProjectRepository projectRepository;
    @Autowired MockRepository mockRepository;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired TransactionTemplate txTemplate;

    @MockitoBean WireMockService wireMockService;

    @BeforeEach
    void cleanDb() {
        jdbcTemplate.execute("TRUNCATE TABLE mocks, projects RESTART IDENTITY CASCADE");
    }

    @Test
    @DisplayName("create then getAll returns it ordered by createdAt DESC")
    void createAndList() throws Exception {
        projectService.create(new CreateProjectRequest("alpha"));
        Thread.sleep(10);
        projectService.create(new CreateProjectRequest("beta"));

        var all = projectService.getAll(Sort.by(Sort.Direction.DESC, "createdAt"));

        assertThat(all).extracting("name").containsExactly("beta", "alpha");
    }

    @Test
    @DisplayName("getById loads mockList without LazyInitializationException")
    void lazyMockListLoadedInTx() {
        var saved = projectRepository.saveAndFlush(new Project("with-mocks"));
        var m = new Mock("m1", "d", saved,
                new HashMap<>(Map.of("urlPath", "/x")),
                new HashMap<>(Map.of("status", 200)),
                false, 5, new HashMap<>(), List.of(), "curl");
        mockRepository.saveAndFlush(m);

        var result = projectService.getById(saved.getId());

        assertThat(result.mocks()).hasSize(1);
        assertThat(result.mocks().get(0).name()).isEqualTo("m1");
    }

    @Test
    @DisplayName("duplicate name at DB level raises DataIntegrityViolationException")
    void uniqueNameAtDbLevel() {
        projectRepository.saveAndFlush(new Project("unique-name"));

        assertThatThrownBy(() -> projectRepository.saveAndFlush(new Project("unique-name")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("ON DELETE CASCADE removes child mocks when project is deleted")
    void cascadeDeletesChildMocks() {
        var p = projectRepository.saveAndFlush(new Project("parent"));
        mockRepository.saveAndFlush(new Mock(
                "child", "d", p,
                new HashMap<>(Map.of("urlPath", "/x")),
                new HashMap<>(Map.of("status", 200)),
                false, 5, new HashMap<>(), List.of(), "curl"));

        projectService.delete(p.getId());

        assertThat(mockRepository.count()).isZero();
        assertThat(projectRepository.count()).isZero();
        verify(wireMockService).deleteByProjectId(p.getId());
    }

    @Test
    @DisplayName("delete rolls back DB removal when WireMock cleanup throws")
    void deleteRollsBackOnWireMockFailure() {
        var p = projectRepository.saveAndFlush(new Project("doomed"));
        doThrow(new WireMockExc("boom", new RuntimeException()))
                .when(wireMockService).deleteByProjectId(any(UUID.class));

        assertThatThrownBy(() -> txTemplate.executeWithoutResult(s -> projectService.delete(p.getId())))
                .isInstanceOf(WireMockExc.class);

        assertThat(projectRepository.existsById(p.getId())).isTrue();
    }

    @Test
    @DisplayName("self-rename to the same name succeeds (no-op rename)")
    void selfRenameSucceeds() {
        var p = projectRepository.saveAndFlush(new Project("solo"));

        var resp = projectService.update(p.getId(), new UpdateProjectRequest("solo"));

        assertThat(resp.name()).isEqualTo("solo");
        assertThat(projectRepository.findById(p.getId()).orElseThrow().getName()).isEqualTo("solo");
    }

    @Test
    @DisplayName("rename rewrites the first path segment on whichever WireMock URL " +
            "match key each child mock uses (url / urlPath / urlPattern / urlPathPattern), " +
            "persists the rewrite to the DB, and re-publishes each mock to WireMock")
    void renameRewritesEveryUrlMatchKeyAndPersists() {
        var p = projectRepository.saveAndFlush(new Project("Old Project"));

        var urlMock        = mockWithUrlKey(p, "url",            "/old-project/exact?q=1");
        var urlPathMock    = mockWithUrlKey(p, "urlPath",        "/old-project/path");
        var urlPatternMock = mockWithUrlKey(p, "urlPattern",     "/old-project/.*");
        var urlPathPat     = mockWithUrlKey(p, "urlPathPattern", "/old-project/[a-z]+");
        mockRepository.saveAllAndFlush(List.of(urlMock, urlPathMock, urlPatternMock, urlPathPat));

        projectService.update(p.getId(), new UpdateProjectRequest("New Project"));

        // Re-read from the DB to confirm the rewrite was persisted, not
        // just held in the in-memory entity for the test.
        var byId = mockRepository.findAllById(List.of(
                urlMock.getId(), urlPathMock.getId(),
                urlPatternMock.getId(), urlPathPat.getId()));
        var byKeyAndId = byId.stream().collect(
                java.util.stream.Collectors.toMap(Mock::getId, m -> m));

        assertThat(byKeyAndId.get(urlMock.getId()).getRequestDefinition().get("url"))
                .isEqualTo("/new-project/exact?q=1");
        assertThat(byKeyAndId.get(urlPathMock.getId()).getRequestDefinition().get("urlPath"))
                .isEqualTo("/new-project/path");
        assertThat(byKeyAndId.get(urlPatternMock.getId()).getRequestDefinition().get("urlPattern"))
                .isEqualTo("/new-project/.*");
        assertThat(byKeyAndId.get(urlPathPat.getId()).getRequestDefinition().get("urlPathPattern"))
                .isEqualTo("/new-project/[a-z]+");

        // Every mock got re-published exactly once.
        verify(wireMockService, org.mockito.Mockito.times(4))
                .updateStub(any(com.wire.mate.service.gateway.dto.WiremockReq.class));
    }

    @Test
    @DisplayName("rename gracefully skips the URL rewrite for child mocks with no URL matcher key " +
            "(\"match anything\" stubs) while still refreshing cURL and re-publishing")
    void renameTolerantOfMissingUrlKey() {
        var p = projectRepository.saveAndFlush(new Project("Old"));

        // No url / urlPath / urlPattern / urlPathPattern — a legitimate
        // "match any URL" stub. Previously this NPE'd; now it should
        // simply skip the path rewrite without breaking the cascade.
        var matchAny = new Mock("any", "d", p,
                new HashMap<>(Map.of("method", "GET")),
                new HashMap<>(Map.of("status", 200)),
                false, 5, new HashMap<>(), List.of(), "curl http://h/old/x");
        mockRepository.saveAndFlush(matchAny);

        projectService.update(p.getId(), new UpdateProjectRequest("New"));

        var fromDb = mockRepository.findById(matchAny.getId()).orElseThrow();
        assertThat(fromDb.getRequestDefinition()).doesNotContainKeys(
                "url", "urlPath", "urlPattern", "urlPathPattern");
        // cURL still rewritten with the new slug.
        assertThat(fromDb.getCurl()).isEqualTo("curl http://h/new/x");
        // Re-publish still fires.
        verify(wireMockService).updateStub(any(com.wire.mate.service.gateway.dto.WiremockReq.class));
    }

    private static Mock mockWithUrlKey(Project p, String key, String value) {
        var req = new HashMap<String, Object>();
        req.put(key, value);
        return new Mock(
                key + "-mock", "d", p,
                req,
                new HashMap<>(Map.of("status", 200)),
                false, 5, new HashMap<>(), List.of(),
                "curl http://h" + value);
    }
}
