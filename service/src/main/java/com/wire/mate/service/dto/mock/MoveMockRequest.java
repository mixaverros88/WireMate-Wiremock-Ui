package com.wire.mate.service.dto.mock;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record MoveMockRequest(
        @NotNull(message = "Target project ID is required")
        UUID targetProjectId
) {
}
