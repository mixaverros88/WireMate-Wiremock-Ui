package com.wire.mate.service.service;

import com.wire.mate.service.dto.mock.CloneMockRequest;
import com.wire.mate.service.dto.mock.CreateMockRequest;
import com.wire.mate.service.dto.mock.MockResponse;
import com.wire.mate.service.dto.mock.MoveMockRequest;
import com.wire.mate.service.dto.mock.UpdateMockRequest;
import com.wire.mate.service.entity.mock.Mock;
import com.wire.mate.service.entity.Project;
import com.wire.mate.service.exception.BadRequestExc;
import com.wire.mate.service.exception.NotFoundExc;
import com.wire.mate.service.exception.WireMockNotFoundExe;
import com.wire.mate.service.logic.WireMockService;
import com.wire.mate.service.repository.MockRepository;
import com.wire.mate.service.repository.ProjectRepository;
import com.wire.mate.service.util.Util;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

@Service
public class MockService {

    private static final Logger log = LoggerFactory.getLogger(MockService.class);

    private final MockRepository mockRepository;
    private final ProjectRepository projectRepository;
    private final WireMockService wireMockService;

    public MockService(
            MockRepository mockRepository,
            ProjectRepository projectRepository,
            WireMockService wireMockService
    ) {
        this.mockRepository = mockRepository;
        this.projectRepository = projectRepository;
        this.wireMockService = wireMockService;
    }

    @Transactional
    public MockResponse create(CreateMockRequest request) {
        Project project = projectRepository
                .findById(request.projectId())
                .orElseThrow(() -> new NotFoundExc("Project id" + request.projectId()));

        if (mockRepository.existsByNameAndProjectId(request.name(), request.projectId())) {
            throw new BadRequestExc("Mock name is already exists");
        }

        Mock saved = mockRepository.save(request.toEntity(project));
        wireMockService.publishStub(saved.toWiremockRequest());
        return saved.toDto();
    }

    @Transactional
    public MockResponse update(UUID mockId, UpdateMockRequest request) {
        Mock mock = mockRepository
                .findById(mockId)
                .orElseThrow(() -> new NotFoundExc("Mock id" + mockId));

        if (!mock.getName().equals(request.name())
                && mockRepository.existsByNameAndProjectId(request.name(), mock.getProject().getId())) {
            throw new BadRequestExc("Mock name is already exists");
        }

        Mock saved = mockRepository.save(request.toEntity(mock));
        wireMockService.updateStub(saved.toWiremockRequest());
        return saved.toDto();
    }

    @Transactional
    public MockResponse clone(UUID mockId, CloneMockRequest request) {
        Mock sourceMock = mockRepository
                .findById(mockId)
                .orElseThrow(() -> new NotFoundExc("Mock  id" + mockId));

        Project project = sourceMock.getProject();

        if (mockRepository.existsByNameAndProjectId(request.name(), project.getId())) {
            throw new BadRequestExc("Mock name is already exists");
        }

        // Copy constructor deep-copies the JSONB maps; the all-args constructor
        // would share map references with the source, so editing one mock would
        // silently mutate the other.
        Mock clone = new Mock(sourceMock, project);
        clone.setName(request.name());
        Mock saved = mockRepository.save(clone);

        wireMockService.publishStub(saved.toWiremockRequest());
        return saved.toDto();
    }

    @Transactional
    public MockResponse move(UUID mockId, MoveMockRequest request) {
        Mock mock = mockRepository
                .findById(mockId)
                .orElseThrow(() -> new NotFoundExc("Mock  id" + mockId));

        Project targetProject = projectRepository
                .findById(request.targetProjectId())
                .orElseThrow(() -> new NotFoundExc("Project Id: " + request.targetProjectId()));

        // Moving a mock to the project it already lives in is a no-op. Without
        // this guard the collision check below always matches the mock's own
        // name and corrupts it with a UUID suffix.
        if (targetProject.getId().equals(mock.getProject().getId())) {
            return mock.toDto();
        }

        if (mockRepository.existsByNameAndProjectId(mock.getName(), targetProject.getId())) {
            mock.setName(mock.getName() + " " + UUID.randomUUID() + " (the uuid added to by pass the name collision)");
        }

        mock.setProject(targetProject);
        renameSpaceToProject(mock, targetProject);

        Mock saved = mockRepository.save(mock);
        // The stub already exists in WireMock under this id (published on
        // create), so re-point it with an update (PUT). Re-publishing via POST
        // would try to *create* a stub with an id that is already registered,
        // which WireMock rejects — that was the "Failed to publish stub" error.
        wireMockService.updateStub(saved.toWiremockRequest());
        return saved.toDto();
    }

    // Re-namespace a moved mock under its new project so the stub is owned by
    // the target everywhere it matters: the URL/cURL first path segment is
    // rewritten to the target slug (mocks are namespaced by `/{slug}/...`,
    // enforced on create and on project rename) and the `projectId` metadata
    // is re-pointed so cross-check and delete-by-project cleanup track the new
    // owner instead of the source project.
    private void renameSpaceToProject(Mock mock, Project targetProject) {
        String targetSlug = Util.toUrlFriendly(targetProject.getName());

        Map<String, Object> requestDefinition = mock.getRequestDefinition();
        String urlKey = Util.firstPresentUrlKey(requestDefinition);
        if (urlKey != null) {
            requestDefinition.put(
                    urlKey,
                    Util.replaceFirstPath(requestDefinition.get(urlKey).toString(), targetSlug)
            );
            mock.setRequestDefinition(requestDefinition);
        }
        mock.setCurl(Util.curlReplaceFirstPath(mock.getCurl(), targetSlug));

        Map<String, Object> metadata = mock.getMetadata() != null
                ? mock.getMetadata()
                : Util.buildMetadata(targetProject.getId());
        metadata.put("projectId", targetProject.getId());
        mock.setMetadata(metadata);
    }

    @Transactional(readOnly = true)
    public MockResponse getById(UUID mockId) {
        return mockRepository
                .findById(mockId)
                .orElseThrow(() -> new NotFoundExc("Mock  id" + mockId))
                .toDto();
    }

    @Transactional(readOnly = true)
    public boolean existsByNameInProject(UUID projectId, String name) {
        if (!projectRepository.existsById(projectId)) {
            throw new NotFoundExc("Project id" + projectId);
        }
        return mockRepository.existsByNameAndProjectId(name, projectId);
    }

    @Transactional(readOnly = true)
    public boolean existsByUrlInProject(UUID projectId, String url) {
        if (!projectRepository.existsById(projectId)) {
            throw new NotFoundExc("Project id" + projectId);
        }
        return mockRepository.existsByUrlAndProjectId(url, projectId);
    }

    @Transactional
    public void delete(UUID mockId) {
        if (!mockRepository.existsById(mockId)) {
            throw new NotFoundExc("Mock  id" + mockId);
        }

        try {
            wireMockService.deleteStub(mockId);
        } catch (WireMockNotFoundExe wireMockNotFoundExe) {
            log.error("Mock id: {}, has not being found in WireMock", mockId);
        }

        mockRepository.deleteById(mockId);
    }

    @Transactional(readOnly = true)
    public void republish(UUID mockId) {
        Mock mock = mockRepository.findById(mockId).orElseThrow(() -> new NotFoundExc("Mock  id" + mockId));

        // PUT updates the stub when it is still registered in WireMock and
        // falls back to a POST create when it is gone — republish must work in
        // both cases (the cross-check drift notifications send users here
        // precisely when the stub is missing upstream).
        wireMockService.updateStub(mock.toWiremockRequest());
    }

}
