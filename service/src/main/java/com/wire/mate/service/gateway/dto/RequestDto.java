package com.wire.mate.service.gateway.dto;

import java.util.Map;

public record RequestDto(
        String url,
        String urlPath,
        String method,
        Map<String, MatchDto> headers,
        Map<String, MatchDto> queryParameters
) {}
