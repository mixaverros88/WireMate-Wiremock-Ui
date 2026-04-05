package com.wire.mate.service.dto.project;

import jakarta.validation.constraints.NotBlank;

public record UpdateProjectRequest(
        @NotBlank(message = "Project name is required")
        String name
) {
}
