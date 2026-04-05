package com.wire.mate.service.logic;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wire.mate.service.config.JsonHelper;
import com.wire.mate.service.exception.WireMockNotFoundExe;
import com.wire.mate.service.gateway.WireMockGateway;
import com.wire.mate.service.gateway.dto.WiremockReq;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.skyscreamer.jsonassert.JSONAssert;
import org.skyscreamer.jsonassert.JSONCompareMode;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

/**
 * Uses the real {@link ObjectMapper}/{@link JsonHelper} because JSON shape is the contract.
 */
@ExtendWith(MockitoExtension.class)
class WireMockServiceTest {

    @Mock private WireMockGateway gateway;

    private WireMockService service;
    private ObjectMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = new ObjectMapper();
        service = new WireMockService(gateway, new JsonHelper(mapper), mapper);
    }

    private static WiremockReq req(UUID id) {
        return new WiremockReq(
                id, "name",
                Map.of("urlPath", "/x"),
                Map.of("status", 200),
                List.of(),
                false, 5,
                Map.of("projectId", UUID.randomUUID().toString())
        );
    }

    @Nested
    @DisplayName("publishStub")
    class PublishStub {

        @Test
        @DisplayName("serializes payload and forwards to gateway with stub id")
        void delegates() throws Exception {
            var id = UUID.randomUUID();
            var req = req(id);

            service.publishStub(req);

            var captor = ArgumentCaptor.forClass(String.class);
            verify(gateway).publishStub(captor.capture(), eq(id));
            JSONAssert.assertEquals(
                    """
                    {"id":"%s","name":"name","persistent":false,"priority":5}
                    """.formatted(id),
                    captor.getValue(),
                    JSONCompareMode.LENIENT);
        }
    }

    @Nested
    @DisplayName("updateStub")
    class UpdateStub {

        @Test
        @DisplayName("serializes payload and forwards to gateway with stub id")
        void delegates() throws Exception {
            var id = UUID.randomUUID();
            var req = req(id);

            service.updateStub(req);

            var captor = ArgumentCaptor.forClass(String.class);
            verify(gateway).updateStub(captor.capture(), eq(id));
            JSONAssert.assertEquals(
                    """
                    {"id":"%s","name":"name"}
                    """.formatted(id),
                    captor.getValue(),
                    JSONCompareMode.LENIENT);
        }
    }

    @Nested
    @DisplayName("deleteStub")
    class DeleteStub {

        @Test
        @DisplayName("forwards mockId to gateway")
        void delegates() throws Exception {
            var id = UUID.randomUUID();

            service.deleteStub(id);

            verify(gateway).deleteStub(id);
        }

        @Test
        @DisplayName("propagates WireMockNotFoundExe from gateway")
        void propagatesNotFound() throws Exception {
            var id = UUID.randomUUID();
            doThrow(new WireMockNotFoundExe("missing")).when(gateway).deleteStub(id);

            assertThatThrownBy(() -> service.deleteStub(id))
                    .isInstanceOf(WireMockNotFoundExe.class);
        }
    }

    @Nested
    @DisplayName("deleteByProjectId")
    class DeleteByProjectId {

        @Test
        @DisplayName("builds matchesJsonPath body with $.projectId equalTo the uuid string")
        void payloadShape() throws Exception {
            var projectId = UUID.randomUUID();

            service.deleteByProjectId(projectId);

            var captor = ArgumentCaptor.forClass(String.class);
            verify(gateway).removeByMetadata(captor.capture());
            JSONAssert.assertEquals(
                    """
                    {
                      "matchesJsonPath": {
                        "expression": "$.projectId",
                        "equalTo": "%s"
                      }
                    }
                    """.formatted(projectId),
                    captor.getValue(),
                    JSONCompareMode.STRICT);
        }

        @Test
        @DisplayName("PINNED: NPE on null projectId (calls toString)")
        // TODO: defensive null-check would be safer in product code.
        void nullProjectIdNpes() {
            assertThatThrownBy(() -> service.deleteByProjectId(null))
                    .isInstanceOf(NullPointerException.class);
        }
    }
}
