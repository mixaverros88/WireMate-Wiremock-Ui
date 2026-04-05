package com.wire.mate.service.gateway.dto;

import java.util.Map;

public record MappingDto(
        String id,
        String name,
        RequestDto request,
        ResponseDto response,
        String uuid,
        Boolean persistent,
        Integer priority,
        Map<String, Object> metadata
) {}

