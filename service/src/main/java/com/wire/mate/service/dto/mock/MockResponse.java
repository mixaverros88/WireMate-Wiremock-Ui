package com.wire.mate.service.dto.mock;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record MockResponse(
        UUID id,
        String name,
        String description,
        UUID projectId,
        String projectName,
        Map<String, Object> request,
        Map<String, Object> response,
        boolean persistent,
        int priority,
        Map<String, Object> metadata,
        List<Map<String, Object>> serveEventListeners,
        String curl,
        Instant createdAt
) {
}
