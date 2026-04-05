package com.wire.mate.service.integration;

import com.wire.mate.service.exception.WireMockNotFoundExe;
import com.wire.mate.service.gateway.WireMockGateway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Real-HTTP test for the gateway against a WireMock Docker container. Verifies wire-format
 * end-to-end (admin API contract).
 */
class WireMockGatewayIT extends IntegrationTestBase {

    @Container
    static final GenericContainer<?> WIREMOCK = new GenericContainer<>("wiremock/wiremock:3.13.1")
            .withExposedPorts(8080)
            .waitingFor(Wait.forHttp("/__admin/health").forStatusCode(200));

    static {
        WIREMOCK.start();
    }

    @DynamicPropertySource
    static void overrideWireMockUrl(DynamicPropertyRegistry registry) {
        registry.add("app.wiremock.base-url",
                () -> "http://" + WIREMOCK.getHost() + ":" + WIREMOCK.getMappedPort(8080));
    }

    @Autowired WireMockGateway gateway;

    @BeforeEach
    void resetWireMock() {
        // delete-all via the admin API
        var ids = gateway.getAllMappingIds();
        for (var id : ids) {
            try {
                gateway.deleteStub(UUID.fromString(id));
            } catch (WireMockNotFoundExe ignored) {
                // ok
            }
        }
    }

    private static String stubPayload(UUID id, String urlPath) {
        return """
               {
                 "id": "%s",
                 "uuid": "%s",
                 "name": "n",
                 "request":  { "method": "GET", "urlPath": "%s" },
                 "response": { "status": 200 },
                 "metadata": { "projectId": "%s" }
               }
               """.formatted(id, id, urlPath, UUID.randomUUID());
    }

    @Test
    @DisplayName("publishStub registers the stub; getAllMappingIds returns its id")
    void publishAndList() {
        var id = UUID.randomUUID();

        gateway.publishStub(stubPayload(id, "/x"), id);

        assertThat(gateway.getAllMappingIds()).contains(id.toString());
    }

    @Test
    @DisplayName("updateStub against an existing id updates and returns 200")
    void updateExisting() {
        var id = UUID.randomUUID();
        gateway.publishStub(stubPayload(id, "/v1"), id);

        gateway.updateStub(stubPayload(id, "/v2"), id);

        assertThat(gateway.getAllMappingIds()).contains(id.toString());
    }

    @Test
    @DisplayName("updateStub against a missing id falls back to publish (404 → POST)")
    void updateFallbackToPublish() {
        var id = UUID.randomUUID();

        gateway.updateStub(stubPayload(id, "/new"), id);

        assertThat(gateway.getAllMappingIds()).contains(id.toString());
    }

    @Test
    @DisplayName("deleteStub removes the mapping")
    void deleteHappyPath() throws Exception {
        var id = UUID.randomUUID();
        gateway.publishStub(stubPayload(id, "/x"), id);

        gateway.deleteStub(id);

        assertThat(gateway.getAllMappingIds()).doesNotContain(id.toString());
    }

    @Test
    @DisplayName("deleteStub on missing id throws WireMockNotFoundExe")
    void deleteMissing() {
        assertThatThrownBy(() -> gateway.deleteStub(UUID.randomUUID()))
                .isInstanceOf(WireMockNotFoundExe.class);
    }

    @Test
    @DisplayName("removeByMetadata clears stubs whose metadata matches the jsonpath")
    void removeByMetadata() {
        var id = UUID.randomUUID();
        var projectId = UUID.randomUUID();
        var payload = """
                {
                  "id": "%s",
                  "uuid": "%s",
                  "name": "n",
                  "request":  { "method": "GET", "urlPath": "/x" },
                  "response": { "status": 200 },
                  "metadata": { "projectId": "%s" }
                }
                """.formatted(id, id, projectId);
        gateway.publishStub(payload, id);

        var matcher = """
                {
                  "matchesJsonPath": {
                    "expression": "$.projectId",
                    "equalTo": "%s"
                  }
                }
                """.formatted(projectId);

        gateway.removeByMetadata(matcher);

        assertThat(gateway.getAllMappingIds()).doesNotContain(id.toString());
    }

    @Test
    @DisplayName("getById on a missing id throws WireMockNotFoundExe")
    void getByIdMissing() {
        assertThatThrownBy(() -> gateway.getById(UUID.randomUUID()))
                .isInstanceOf(WireMockNotFoundExe.class);
    }

    @Test
    @DisplayName("getById on an existing id returns normally")
    void getByIdExisting() {
        var id = UUID.randomUUID();
        gateway.publishStub(stubPayload(id, "/x"), id);

        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> gateway.getById(id));
    }
}
