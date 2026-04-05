package com.wire.mate.service.dto.mock;

import jakarta.validation.constraints.NotBlank;

public record CloneMockRequest(
        @NotBlank(message = "New mock name is required")
        String name
) {
}
