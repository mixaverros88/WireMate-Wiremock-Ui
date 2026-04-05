package com.wire.mate.service.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@ConfigurationProperties(prefix = "app")
@Validated
public record WireMateProperties(

        @NotNull
        @Valid
        WireMock wiremock,

        @NotNull
        @Valid
        CrossCheck crossCheck,

        @NotNull
        @Valid
        Cors cors
) {

    public record WireMock(
            @NotBlank String baseUrl,
            @NotBlank String mainPath,
            @NotNull Duration connectTimeout,
            @NotNull Duration readTimeout
    ) {
    }

    public record CrossCheck(
            @NotNull Duration interval,
            boolean enabled
    ) {
    }

    public record Cors(
            String[] allowedOrigins
    ) {
    }
}
