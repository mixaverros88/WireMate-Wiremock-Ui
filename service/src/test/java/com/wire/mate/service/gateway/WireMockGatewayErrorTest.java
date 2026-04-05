package com.wire.mate.service.gateway;

import com.wire.mate.service.config.WireMateProperties;
import com.wire.mate.service.exception.WireMockExc;
import com.wire.mate.service.exception.WireMockNotFoundExe;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Unit-level tests for {@link WireMockGateway} that exercise HTTP error translation
 * to {@link WireMockExc} / {@link WireMockNotFoundExe}. Uses {@link MockRestServiceServer}
 * bound to a {@link RestClient.Builder} so no container is required.
 */
class WireMockGatewayErrorTest {

    private static final String BASE_URL = "http://wiremock.test";
    private static final String MAIN_PATH = "/__admin/mappings";

    private WireMockGateway gateway;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        var builder = RestClient.builder().baseUrl(BASE_URL);
        server = MockRestServiceServer.bindTo(builder).build();
        var restClient = builder.build();
        var props = new WireMateProperties(
                new WireMateProperties.WireMock(BASE_URL, MAIN_PATH,
                        Duration.ofSeconds(1), Duration.ofSeconds(1)),
                new WireMateProperties.CrossCheck(Duration.ofSeconds(10), false),
                new WireMateProperties.Cors(new String[]{}));
        gateway = new WireMockGateway(restClient, props);
    }

    @Test
    @DisplayName("publishStub: 500 → WireMockExc with stub id in the message")
    void publishServerError() {
        var id = UUID.randomUUID();
        server.expect(requestTo(BASE_URL + MAIN_PATH))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andRespond(withServerError());

        assertThatThrownBy(() -> gateway.publishStub("{}", id))
                .isInstanceOf(WireMockExc.class)
                .hasMessageContaining(id.toString());

        server.verify();
    }

    @Test
    @DisplayName("updateStub: non-404 5xx → WireMockExc (no fallback)")
    void updateGenericFailure() {
        var id = UUID.randomUUID();
        server.expect(requestTo(BASE_URL + MAIN_PATH + "/" + id))
                .andExpect(method(org.springframework.http.HttpMethod.PUT))
                .andRespond(withServerError());

        assertThatThrownBy(() -> gateway.updateStub("{}", id))
                .isInstanceOf(WireMockExc.class)
                .hasMessageContaining(id.toString());

        server.verify();
    }

    @Test
    @DisplayName("updateStub: 404 falls back to publishStub (POST) and succeeds")
    void update404FallsBackToPublish() {
        var id = UUID.randomUUID();
        server.expect(requestTo(BASE_URL + MAIN_PATH + "/" + id))
                .andExpect(method(org.springframework.http.HttpMethod.PUT))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(requestTo(BASE_URL + MAIN_PATH))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andRespond(withSuccess());

        gateway.updateStub("{}", id);

        server.verify();
    }

    @Test
    @DisplayName("deleteStub: 404 → WireMockNotFoundExe")
    void deleteNotFound() {
        var id = UUID.randomUUID();
        server.expect(requestTo(BASE_URL + MAIN_PATH + "/" + id))
                .andExpect(method(org.springframework.http.HttpMethod.DELETE))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThatThrownBy(() -> gateway.deleteStub(id))
                .isInstanceOf(WireMockNotFoundExe.class)
                .hasMessageContaining(id.toString());

        server.verify();
    }

    @Test
    @DisplayName("deleteStub: non-404 5xx → WireMockExc")
    void deleteServerError() {
        var id = UUID.randomUUID();
        server.expect(requestTo(BASE_URL + MAIN_PATH + "/" + id))
                .andExpect(method(org.springframework.http.HttpMethod.DELETE))
                .andRespond(withServerError());

        assertThatThrownBy(() -> gateway.deleteStub(id))
                .isInstanceOf(WireMockExc.class);

        server.verify();
    }

    @Test
    @DisplayName("getAllStubs: 5xx → WireMockExc")
    void getAllServerError() {
        server.expect(requestTo(BASE_URL + MAIN_PATH))
                .andExpect(method(org.springframework.http.HttpMethod.GET))
                .andRespond(withServerError());

        assertThatThrownBy(() -> gateway.getAllStubs())
                .isInstanceOf(WireMockExc.class);

        server.verify();
    }

    @Test
    @DisplayName("getAllStubs: happy path deserializes WireMockResponseDto")
    void getAllHappyPath() {
        server.expect(requestTo(BASE_URL + MAIN_PATH))
                .andExpect(method(org.springframework.http.HttpMethod.GET))
                .andRespond(withSuccess(
                        "{\"mappings\": [{\"id\": \"abc\"}], \"meta\": {\"total\": 1}}",
                        MediaType.APPLICATION_JSON));

        var resp = gateway.getAllStubs();

        assertThat(resp.mappings()).hasSize(1);
        assertThat(resp.mappings().get(0).id()).isEqualTo("abc");
        server.verify();
    }

    @Test
    @DisplayName("removeByMetadata: 5xx → WireMockExc")
    void removeByMetadataError() {
        server.expect(requestTo(BASE_URL + MAIN_PATH + "/remove-by-metadata"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andRespond(withServerError());

        assertThatThrownBy(() -> gateway.removeByMetadata("{}"))
                .isInstanceOf(WireMockExc.class)
                .hasMessageContaining("metadata");

        server.verify();
    }

    @Test
    @DisplayName("removeByMetadata: 2xx happy path returns normally")
    void removeByMetadataOk() {
        server.expect(requestTo(BASE_URL + MAIN_PATH + "/remove-by-metadata"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andRespond(withSuccess());

        gateway.removeByMetadata("{}");

        server.verify();
    }

    @Test
    @DisplayName("updateStub: 4xx (non-404) → WireMockExc, NOT the publish fallback")
    void update4xxNonNotFoundIsExc() {
        var id = UUID.randomUUID();
        server.expect(requestTo(BASE_URL + MAIN_PATH + "/" + id))
                .andExpect(method(org.springframework.http.HttpMethod.PUT))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertThatThrownBy(() -> gateway.updateStub("{}", id))
                .isInstanceOf(WireMockExc.class);

        // No second request should have been made (no publish fallback for non-404 4xx).
        server.verify();
    }

    @Test
    @DisplayName("deleteStub: 4xx (non-404) → WireMockExc, not WireMockNotFoundExe")
    void delete4xxNonNotFoundIsExc() {
        var id = UUID.randomUUID();
        server.expect(requestTo(BASE_URL + MAIN_PATH + "/" + id))
                .andExpect(method(org.springframework.http.HttpMethod.DELETE))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        assertThatThrownBy(() -> gateway.deleteStub(id))
                .isInstanceOf(WireMockExc.class)
                // NOT a WireMockNotFoundExe — that path is reserved for 404 only
                .isNotInstanceOf(WireMockNotFoundExe.class);

        server.verify();
    }

    @Test
    @DisplayName("getAllMappingIds returns an empty set when WireMock has no mappings")
    void getAllMappingIdsEmpty() {
        server.expect(requestTo(BASE_URL + MAIN_PATH))
                .andExpect(method(org.springframework.http.HttpMethod.GET))
                .andRespond(withSuccess(
                        "{\"mappings\": [], \"meta\": {\"total\": 0}}",
                        MediaType.APPLICATION_JSON));

        assertThat(gateway.getAllMappingIds()).isEmpty();
        server.verify();
    }

    @Test
    @DisplayName("publishStub: 2xx happy path returns normally")
    void publishOk() {
        var id = UUID.randomUUID();
        server.expect(requestTo(BASE_URL + MAIN_PATH))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andRespond(withSuccess());

        gateway.publishStub("{}", id);

        server.verify();
    }
}
