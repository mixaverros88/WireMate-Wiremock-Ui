package com.wire.mate.service.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

@Configuration
public class CorsConfig {

    private static final List<String> ALLOWED_HEADERS = List.of(
            "Content-Type",
            "Accept",
            "Authorization",
            "X-Request-Id",
            "X-Correlation-Id"
    );

    /**
     * CORS is restricted to:
     *   - explicit origins from {@code app.cors.allowed-origins}
     *   - the HTTP methods this API actually exposes
     *   - the headers our clients actually need
     *
     * Wildcards are deliberately avoided — a wildcard combined with
     * {@code allowCredentials=true} would be rejected by browsers anyway, and
     * makes the surface area for credential leakage larger than it needs to be.
     */
    @Bean
    public WebMvcConfigurer corsConfigurer(WireMateProperties properties) {
        String[] origins = properties.cors().allowedOrigins() == null
                ? new String[0]
                : properties.cors().allowedOrigins();

        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                        .allowedOrigins(origins)
                        .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                        .allowedHeaders(ALLOWED_HEADERS.toArray(new String[0]))
                        .exposedHeaders("X-Request-Id", "X-Correlation-Id")
                        .allowCredentials(true)
                        .maxAge(3600);
            }
        };
    }
}
