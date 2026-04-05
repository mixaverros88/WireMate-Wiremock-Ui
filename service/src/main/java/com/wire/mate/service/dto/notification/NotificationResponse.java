package com.wire.mate.service.dto.notification;

import java.time.Instant;

public record NotificationResponse(
        Long id,
        String name,
        Instant createdAt
) {
}
