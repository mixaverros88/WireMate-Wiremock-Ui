package com.wire.mate.service.dto.mock;

import com.wire.mate.service.entity.mock.Mock;
import com.wire.mate.service.util.Util;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public record UpdateMockRequest(

        @NotBlank(message = "Mock name is required")
        @Size(max = 255, message = "Mock name must be at most 255 characters")
        String name,

        @Size(max = 1024, message = "Description must be at most 1024 characters")
        String description,

        @NotNull(message = "Request definition is required")
        Map<String, Object> request,

        @NotNull(message = "Response definition is required")
        Map<String, Object> response,

        boolean persistent,
        int priority,
        Map<String, Object> metadata,
        List<Map<String, Object>> serveEventListeners,
        String curl
) {

    public Mock toEntity(final Mock mock) {
        mock.setName(this.name);
        mock.setDescription(this.description);
        mock.setRequestDefinition(this.request);
        mock.setResponseDefinition(this.response);
        mock.setPersistent(this.persistent);
        mock.setPriority(this.priority);
        // Merge caller metadata with the system-managed keys (generatedBy,
        // projectId) so the latter always survive an update — losing projectId
        // breaks WireMock cleanup-by-metadata and the cross-check deep links.
        Map<String, Object> metadata = this.metadata != null
                ? new HashMap<>(this.metadata)
                : new HashMap<>();
        metadata.putAll(Util.buildMetadata(mock.getProject().getId()));
        mock.setMetadata(metadata);
        mock.setServeEventListeners(this.serveEventListeners);
        mock.setCurl(this.curl);
        return mock;
    }
}
