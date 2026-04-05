package com.wire.mate.service.entity.mock;

import java.util.UUID;

/**
 * Projection of a mock's id paired with its parent project id. The cross-check
 * task uses this to build deep links into the WireMate UI
 * ({@code /projects/{projectId}/mocks/{mockId}/edit}) for drift notifications.
 */
public interface MockIdProjectId {

    UUID getId();

    ProjectRef getProject();

    interface ProjectRef {
        UUID getId();
    }
}
