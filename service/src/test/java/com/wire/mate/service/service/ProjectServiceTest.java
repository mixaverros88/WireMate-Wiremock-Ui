package com.wire.mate.service.service;

import com.wire.mate.service.dto.project.CreateProjectRequest;
import com.wire.mate.service.dto.project.ProjectResponse;
import com.wire.mate.service.dto.project.ProjectWithMocksResponse;
import com.wire.mate.service.dto.project.UpdateProjectRequest;
import com.wire.mate.service.entity.Project;
import com.wire.mate.service.exception.BadRequestExc;
import com.wire.mate.service.exception.NotFoundExc;
import com.wire.mate.service.gateway.dto.WiremockReq;
import com.wire.mate.service.logic.WireMockService;
import com.wire.mate.service.repository.ProjectRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Sort;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectServiceTest {

    @Mock private ProjectRepository projectRepository;
    @Mock private WireMockService wireMockService;

    @InjectMocks private ProjectService service;

    private static Project project(String name) {
        var p = new Project(name);
        p.setId(UUID.randomUUID());
        return p;
    }

    @Nested
    @DisplayName("getAll")
    class GetAll {

        @Test
        @DisplayName("returns empty list when no projects exist")
        void empty() {
            when(projectRepository.findAll(any(Sort.class))).thenReturn(List.of());

            assertThat(service.getAll(Sort.by(Sort.Direction.DESC, "createdAt"))).isEmpty();
        }

        @Test
        @DisplayName("passes the given sort through to the repository")
        void passesSortThrough() {
            when(projectRepository.findAll(any(Sort.class))).thenReturn(List.of(project("a")));

            var sort = Sort.by(Sort.Direction.ASC, "name");
            service.getAll(sort);

            var captor = ArgumentCaptor.forClass(Sort.class);
            verify(projectRepository).findAll(captor.capture());
            assertThat(captor.getValue()).isEqualTo(sort);
        }

        @Test
        @DisplayName("maps each project through toDto")
        void mapsToDto() {
            var p = project("foo");
            when(projectRepository.findAll(any(Sort.class))).thenReturn(List.of(p));

            List<ProjectResponse> result = service.getAll(Sort.by(Sort.Direction.DESC, "createdAt"));

            assertThat(result).singleElement()
                    .satisfies(r -> {
                        assertThat(r.id()).isEqualTo(p.getId());
                        assertThat(r.name()).isEqualTo("foo");
                    });
        }
    }

    @Nested
    @DisplayName("getById")
    class GetById {

        @Test
        @DisplayName("throws NotFoundExc when project missing")
        void notFound() {
            var id = UUID.randomUUID();
            when(projectRepository.findById(id)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.getById(id))
                    .isInstanceOf(NotFoundExc.class)
                    .hasMessageContaining(id.toString());
        }

        @Test
        @DisplayName("returns ProjectWithMocksResponse including mock list")
        void happyPath() {
            var p = project("alpha");
            when(projectRepository.findById(p.getId())).thenReturn(Optional.of(p));

            ProjectWithMocksResponse result = service.getById(p.getId());

            assertThat(result.id()).isEqualTo(p.getId());
            assertThat(result.name()).isEqualTo("alpha");
            assertThat(result.mocks()).isEmpty();
        }
    }

    @Nested
    @DisplayName("create")
    class Create {

        @Test
        @DisplayName("throws BadRequestExc when name already exists")
        void duplicateName() {
            when(projectRepository.existsByName("dup")).thenReturn(true);

            assertThatThrownBy(() -> service.create(new CreateProjectRequest("dup")))
                    .isInstanceOf(BadRequestExc.class)
                    .hasMessageContaining("dup")
                    .hasMessageContaining("already exists");

            verify(projectRepository, never()).save(any());
            verifyNoInteractions(wireMockService);
        }

        @Test
        @DisplayName("saves and returns DTO for fresh name")
        void happyPath() {
            when(projectRepository.existsByName("new")).thenReturn(false);
            when(projectRepository.save(any(Project.class))).thenAnswer(inv -> {
                var arg = inv.<Project>getArgument(0);
                arg.setId(UUID.randomUUID());
                return arg;
            });

            ProjectResponse resp = service.create(new CreateProjectRequest("new"));

            assertThat(resp.name()).isEqualTo("new");
            assertThat(resp.id()).isNotNull();
        }
    }

    @Nested
    @DisplayName("update")
    class Update {

        @Test
        @DisplayName("throws NotFoundExc when project missing")
        void notFound() {
            var id = UUID.randomUUID();
            when(projectRepository.findById(id)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.update(id, new UpdateProjectRequest("anything")))
                    .isInstanceOf(NotFoundExc.class);
        }

        @Test
        @DisplayName("throws BadRequestExc when proposed name collides with another project")
        void collision() {
            var p = project("old");
            when(projectRepository.findById(p.getId())).thenReturn(Optional.of(p));
            when(projectRepository.existsByName("taken")).thenReturn(true);

            assertThatThrownBy(() -> service.update(p.getId(), new UpdateProjectRequest("taken")))
                    .isInstanceOf(BadRequestExc.class)
                    .hasMessageContaining("taken");

            verify(projectRepository, never()).save(any());
        }

        @Test
        @DisplayName("self-rename to the same name succeeds — the uniqueness check skips the project itself")
        void selfRenameSucceeds() {
            var p = project("same");
            when(projectRepository.findById(p.getId())).thenReturn(Optional.of(p));
            when(projectRepository.save(p)).thenReturn(p);

            var resp = service.update(p.getId(), new UpdateProjectRequest("same"));

            assertThat(resp.name()).isEqualTo("same");
            verify(projectRepository, never()).existsByName(any());
        }

        @Test
        @DisplayName("updates name, cascades urlPath/curl rewrite to every child mock")
        void cascadesUrlRewriteToMocks() {
            var p = project("Old Project");
            var mock = mockOf(p, "/old-project/users", "curl http://h/old-project/users");
            p.setMockList(Set.of(mock));

            when(projectRepository.findById(p.getId())).thenReturn(Optional.of(p));
            when(projectRepository.existsByName("New Project")).thenReturn(false);
            when(projectRepository.save(p)).thenReturn(p);

            ProjectResponse resp = service.update(p.getId(), new UpdateProjectRequest("New Project"));

            assertThat(resp.name()).isEqualTo("New Project");
            assertThat(mock.getRequestDefinition().get("urlPath")).isEqualTo("/new-project/users");
            assertThat(mock.getCurl()).isEqualTo("curl http://h/new-project/users");

            var captor = ArgumentCaptor.forClass(WiremockReq.class);
            verify(wireMockService).updateStub(captor.capture());
            assertThat(captor.getValue().id()).isEqualTo(mock.getId());
        }

        @Test
        @DisplayName("cascade no-ops the URL rewrite when a child mock has no URL matcher key, " +
                "but still refreshes the cURL and re-publishes to WireMock")
        void cascadeHandlesMissingUrlMatcherGracefully() {
            // A "match any URL" stub legitimately has no url / urlPath / urlPattern /
            // urlPathPattern in its requestDefinition. The rename cascade used to
            // dereference urlPath unconditionally and NPE; the fix detects the
            // missing key and skips the path rewrite while still keeping the
            // cURL and the WireMock-side stub in step with the new project name.
            var p = project("Old");
            var matchAnyUrl = mockOf(p, null, "curl http://h/old/x");
            matchAnyUrl.setRequestDefinition(new HashMap<>(Map.of("method", "GET")));
            p.setMockList(Set.of(matchAnyUrl));

            when(projectRepository.findById(p.getId())).thenReturn(Optional.of(p));
            when(projectRepository.existsByName("New")).thenReturn(false);
            when(projectRepository.save(p)).thenReturn(p);

            // No throw.
            service.update(p.getId(), new UpdateProjectRequest("New"));

            // Request definition still has no URL matcher (we didn't invent one).
            assertThat(matchAnyUrl.getRequestDefinition()).doesNotContainKeys(
                    "url", "urlPath", "urlPattern", "urlPathPattern");
            // cURL was rewritten with the new slug.
            assertThat(matchAnyUrl.getCurl()).isEqualTo("curl http://h/new/x");
            // WireMock re-publish still fired.
            verify(wireMockService).updateStub(any(WiremockReq.class));
        }

        @Test
        @DisplayName("cascade rewrites the URL whichever of the four WireMock match keys " +
                "the mock uses (url / urlPath / urlPattern / urlPathPattern)")
        void cascadeRewritesEveryUrlMatchKey() {
            // WireMock supports four mutually-exclusive URL match keys on a
            // request pattern. Older fix only handled `urlPath`; the rename
            // cascade now finds whichever key is present and rewrites it.
            var p = project("Old");
            var urlMock         = mockWithUrlKey(p, "url",            "/old/exact?q=1");
            var urlPathMock     = mockWithUrlKey(p, "urlPath",        "/old/path");
            var urlPatternMock  = mockWithUrlKey(p, "urlPattern",     "/old/.*");
            var urlPathPattern  = mockWithUrlKey(p, "urlPathPattern", "/old/[a-z]+");
            p.setMockList(Set.of(urlMock, urlPathMock, urlPatternMock, urlPathPattern));

            when(projectRepository.findById(p.getId())).thenReturn(Optional.of(p));
            when(projectRepository.existsByName("New")).thenReturn(false);
            when(projectRepository.save(p)).thenReturn(p);

            service.update(p.getId(), new UpdateProjectRequest("New"));

            assertThat(urlMock.getRequestDefinition().get("url")).isEqualTo("/new/exact?q=1");
            assertThat(urlPathMock.getRequestDefinition().get("urlPath")).isEqualTo("/new/path");
            assertThat(urlPatternMock.getRequestDefinition().get("urlPattern")).isEqualTo("/new/.*");
            assertThat(urlPathPattern.getRequestDefinition().get("urlPathPattern")).isEqualTo("/new/[a-z]+");

            // Each mock should have been re-published exactly once.
            verify(wireMockService, times(4)).updateStub(any(WiremockReq.class));
        }

        @Test
        @DisplayName("cascade rewrites the first key in the documented priority order " +
                "(url > urlPath > urlPattern > urlPathPattern) when several are set at once")
        void cascadePicksHighestPriorityUrlKey() {
            // The frontend's `getMockUrl` resolves URLs in this priority order,
            // and the rename cascade now mirrors it so the rewrite is
            // deterministic for hand-crafted stubs that happen to set more than
            // one matcher.
            var p = project("Old");
            var m = mockWithUrlKey(p, "url", "/old/exact");
            m.getRequestDefinition().put("urlPath", "/old/path");
            m.getRequestDefinition().put("urlPattern", "/old/.*");
            p.setMockList(Set.of(m));

            when(projectRepository.findById(p.getId())).thenReturn(Optional.of(p));
            when(projectRepository.existsByName("New")).thenReturn(false);
            when(projectRepository.save(p)).thenReturn(p);

            service.update(p.getId(), new UpdateProjectRequest("New"));

            // `url` wins → rewritten.
            assertThat(m.getRequestDefinition().get("url")).isEqualTo("/new/exact");
            // The two lower-priority keys are left alone (WireMock would already
            // ignore them in the presence of `url`).
            assertThat(m.getRequestDefinition().get("urlPath")).isEqualTo("/old/path");
            assertThat(m.getRequestDefinition().get("urlPattern")).isEqualTo("/old/.*");
        }

        @Test
        @DisplayName("PINNED: project name slugging to empty produces a '/' path in the rewritten urlPath")
        // toUrlFriendly("!!!") returns ""; replaceFirstPath then writes "/" segment.
        void slugToEmptyProducesEmptyFirstSegment() {
            var p = project("!!!");
            var mock = mockOf(p, "/old-name/users", "curl http://h/old-name/users");
            p.setMockList(Set.of(mock));
            // rename triggers cascade — set name on the project mid-test via setName
            when(projectRepository.findById(p.getId())).thenReturn(Optional.of(p));
            when(projectRepository.existsByName("###")).thenReturn(false);
            when(projectRepository.save(p)).thenReturn(p);

            service.update(p.getId(), new UpdateProjectRequest("###"));

            // After update, p.name is "###" → slug is "". urlPath becomes "//users".
            assertThat(mock.getRequestDefinition().get("urlPath")).isEqualTo("//users");
        }

        @Test
        @DisplayName("does not call updateStub when project has no mocks")
        void noMocks_noWireMockCall() {
            var p = project("solo");
            when(projectRepository.findById(p.getId())).thenReturn(Optional.of(p));
            when(projectRepository.existsByName("solo-2")).thenReturn(false);
            when(projectRepository.save(p)).thenReturn(p);

            service.update(p.getId(), new UpdateProjectRequest("solo-2"));

            verifyNoInteractions(wireMockService);
        }
    }

    @Nested
    @DisplayName("delete")
    class Delete {

        @Test
        @DisplayName("throws NotFoundExc when project missing")
        void notFound() {
            var id = UUID.randomUUID();
            when(projectRepository.findById(id)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.delete(id))
                    .isInstanceOf(NotFoundExc.class);

            verifyNoInteractions(wireMockService);
        }

        @Test
        @DisplayName("cleans WireMock before deleting from DB")
        void wireMockBeforeDb() {
            var p = project("doomed");
            when(projectRepository.findById(p.getId())).thenReturn(Optional.of(p));

            service.delete(p.getId());

            InOrder order = inOrder(wireMockService, projectRepository);
            order.verify(wireMockService).deleteByProjectId(p.getId());
            order.verify(projectRepository).delete(p);
        }
    }

    // ----- helpers -----

    private static com.wire.mate.service.entity.mock.Mock mockOf(Project p, String urlPath, String curl) {
        var m = new com.wire.mate.service.entity.mock.Mock();
        m.setId(UUID.randomUUID());
        m.setProject(p);
        m.setName("m");
        var req = new HashMap<String, Object>();
        req.put("urlPath", urlPath);
        m.setRequestDefinition(req);
        m.setResponseDefinition(new HashMap<>());
        m.setMetadata(new HashMap<>());
        m.setCurl(curl);
        return m;
    }

    /**
     * Build a Mock whose requestDefinition uses an arbitrary WireMock URL
     * match key (`url`, `urlPath`, `urlPattern`, or `urlPathPattern`).
     * Used to assert that the rename cascade handles every variant —
     * not just `urlPath`, which is what the original bug only covered.
     */
    private static com.wire.mate.service.entity.mock.Mock mockWithUrlKey(Project p, String key, String value) {
        var m = new com.wire.mate.service.entity.mock.Mock();
        m.setId(UUID.randomUUID());
        m.setProject(p);
        m.setName(key + "-mock");
        var req = new HashMap<String, Object>();
        req.put(key, value);
        m.setRequestDefinition(req);
        m.setResponseDefinition(new HashMap<>());
        m.setMetadata(new HashMap<>());
        m.setCurl("curl http://h" + value);
        return m;
    }
}
