package com.wire.mate.service.gateway.dto;

import java.util.List;

public record WireMockResponseDto(
        List<MappingDto> mappings,
        MetaDto meta
) {}
