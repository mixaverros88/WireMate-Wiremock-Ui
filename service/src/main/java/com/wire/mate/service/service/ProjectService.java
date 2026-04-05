package com.wire.mate.service.service;

import com.wire.mate.service.dto.project.CreateProjectRequest;
import com.wire.mate.service.dto.project.ProjectResponse;
import com.wire.mate.service.dto.project.ProjectWithMocksResponse;
import com.wire.mate.service.dto.project.UpdateProjectRequest;
import com.wire.mate.service.entity.Project;
import com.wire.mate.service.exception.BadRequestExc;
import com.wire.mate.service.exception.NotFoundExc;
import com.wire.mate.service.logic.WireMockService;
import com.wire.mate.service.repository.ProjectRepository;
import com.wire.mate.service.util.Util;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final WireMockService wireMockService;

    public ProjectService(
            ProjectRepository projectRepository,
            WireMockService wireMockService
    ) {
        this.projectRepository = projectRepository;
        this.wireMockService = wireMockService;
    }

    @Transactional(readOnly = true)
    public List<ProjectResponse> getAll(final Sort sort) {
        return projectRepository
                .findAll(sort)
                .stream()
                .map(Project::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public ProjectWithMocksResponse getById(UUID projectId) {
        return getProjectOrThrow(projectId).toDtoWithMocks();
    }

    @Transactional
    public ProjectResponse create(CreateProjectRequest request) {
        if (projectRepository.existsByName(request.name())) {
            throw new BadRequestExc("Project with name: " + request.name() + " already exists");
        }

        return projectRepository.save(request.toEntity()).toDto();
    }

    @Transactional
    public ProjectResponse update(UUID projectId, UpdateProjectRequest request) {
        Project project = getProjectOrThrow(projectId);

        // Renaming a project to its current name is a no-op, not a collision —
        // only reject when a *different* project already owns the new name.
        if (!project.getName().equals(request.name())
                && projectRepository.existsByName(request.name())) {
            throw new BadRequestExc("Project with name: " + request.name() + "  already exists");
        }

        project.setName(request.name());
        Project saved = projectRepository.save(project);

        updateUrlPathOnEveryRequestDefinitionInMock(saved);

        return saved.toDto();
    }

    @Transactional
    public void delete(UUID projectId) {
        Project project = getProjectOrThrow(projectId);

        wireMockService.deleteByProjectId(project.getId());
        projectRepository.delete(project);
    }

    private Project getProjectOrThrow(final UUID projectId) {
        return projectRepository
                .findById(projectId)
                .orElseThrow(() -> new NotFoundExc("Project ID: " + projectId));
    }

    private void updateUrlPathOnEveryRequestDefinitionInMock(Project project) {
        String friendlyUrlPath = Util.toUrlFriendly(project.getName());
        project
                .getMockList()
                .forEach(it -> {
                    Map<String, Object> requestDefinition = it.getRequestDefinition();
                    String urlKey = Util.firstPresentUrlKey(requestDefinition);
                    if (urlKey != null) {
                        String finalUrlPath = Util.replaceFirstPath(
                                requestDefinition.get(urlKey).toString(),
                                friendlyUrlPath
                        );
                        requestDefinition.put(urlKey, finalUrlPath);
                        it.setRequestDefinition(requestDefinition);
                    }
                    // The cURL refresh and WireMock re-publish run even
                    // when no URL matcher was present (e.g. a "match any"
                    // stub) so the upstream stub and the stored cURL
                    // stay in step with the renamed project.
                    it.setCurl(Util.curlReplaceFirstPath(it.getCurl(), friendlyUrlPath));
                    wireMockService.updateStub(it.toWiremockRequest());
                });
    }

}
