package com.wire.mate.service.dto.project;

import com.wire.mate.service.dto.mock.MockResponse;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ProjectWithMocksResponse(
        UUID id,
        String name,
        List<MockResponse> mocks,
        Instant createdAt
) {
}
