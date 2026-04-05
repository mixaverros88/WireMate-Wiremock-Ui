package com.wire.mate.service.dto.project;

import com.wire.mate.service.entity.Project;
import jakarta.validation.constraints.NotBlank;

public record CreateProjectRequest(
        @NotBlank(message = "Project name is required")
        String name
) {
    public Project toEntity() {
        return new Project(this.name);
    }
}
