package com.wire.mate.service.logic;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.wire.mate.service.config.JsonHelper;
import com.wire.mate.service.exception.WireMockNotFoundExe;
import com.wire.mate.service.gateway.dto.WiremockReq;
import com.wire.mate.service.gateway.WireMockGateway;
import org.jspecify.annotations.NonNull;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Orchestration layer between the domain services and {@link WireMockGateway}.
 * Translates domain-level stub operations (publish, update, delete, bulk-remove
 * by project) into the JSON payloads the WireMock admin API expects, so the
 * domain services never deal with the WireMock wire format directly.
 */
@Component
public class WireMockService {

    private static final Logger log = LoggerFactory.getLogger(WireMockService.class);

    private final WireMockGateway wireMockGateway;
    private final JsonHelper jsonHelper;
    private final ObjectMapper objectMapper;

    public WireMockService(
            WireMockGateway wireMockGateway,
            JsonHelper jsonHelper,
            ObjectMapper objectMapper
    ) {
        this.wireMockGateway = wireMockGateway;
        this.jsonHelper = jsonHelper;
        this.objectMapper = objectMapper;
    }

    /**
     * Registers a new stub in WireMock.
     *
     * @param mockReq the stub mapping to publish; its id becomes the WireMock stub id
     */
    public void publishStub(WiremockReq mockReq) {
        String payload = jsonHelper.toJson(mockReq);
        log.debug("publishStub: payload={}", payload);
        wireMockGateway.publishStub(payload, mockReq.id());
    }

    /**
     * Updates an existing stub in WireMock. If the stub is no longer registered
     * (e.g. WireMock was restarted), the gateway falls back to creating it, so
     * this is safe to use for republishing.
     *
     * @param mock the stub mapping to update, matched by its id
     */
    public void updateStub(WiremockReq mock) {
        String payload = jsonHelper.toJson(mock);
        log.debug("updateStub: payload={}", payload);
        wireMockGateway.updateStub(payload, mock.id());
    }

    /**
     * Deletes a single stub from WireMock.
     *
     * @param mockId id of the stub to delete
     * @throws WireMockNotFoundExe if no stub with that id is registered
     */
    public void deleteStub(UUID mockId) throws WireMockNotFoundExe {
        log.debug("deleteStub: mockId={}", mockId);
        wireMockGateway.deleteStub(mockId);
    }

    /**
     * Checks that a stub is registered in WireMock. The response body is
     * discarded — callers use this purely as an existence probe.
     *
     * @param mockId id of the stub to look up
     * @throws WireMockNotFoundExe if no stub with that id is registered
     */
    public void getById(UUID mockId) throws WireMockNotFoundExe {
        wireMockGateway.getById(mockId);
    }

    /**
     * Bulk-removes every stub belonging to a project. Matches stubs via their
     * {@code metadata.projectId} using WireMock's remove-by-metadata endpoint
     * with a {@code matchesJsonPath} expression.
     *
     * @param projectId id of the project whose stubs should be removed
     */
    public void deleteByProjectId(UUID projectId) {
        String json = prepareRemoveByProjectIdMetadata(projectId);
        log.debug("deleteByProjectId: metadata={}", json);
        wireMockGateway.removeByMetadata(json);
    }

    private @NonNull String prepareRemoveByProjectIdMetadata(UUID projectId) {
        ObjectNode matcher = objectMapper.createObjectNode();
        matcher.put("expression", "$.projectId");
        matcher.put("equalTo", projectId.toString());

        ObjectNode body = objectMapper.createObjectNode();
        body.set("matchesJsonPath", matcher);

        return jsonHelper.toJson(body);
    }

}
