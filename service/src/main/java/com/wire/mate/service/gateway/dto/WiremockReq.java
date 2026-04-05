package com.wire.mate.service.gateway.dto;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public record WiremockReq(
        UUID id,
        String name,
        Map<String, Object> request,
        Map<String, Object> response,
        List<Map<String, Object>> serveEventListeners,
        boolean persistent,
        int priority,
        Map<String, Object> metadata
) {
}
