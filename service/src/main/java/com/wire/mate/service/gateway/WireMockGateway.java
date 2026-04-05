package com.wire.mate.service.gateway;

import com.wire.mate.service.config.WireMateProperties;
import com.wire.mate.service.exception.WireMockNotFoundExe;
import com.wire.mate.service.exception.WireMockExc;
import com.wire.mate.service.gateway.dto.MappingDto;
import com.wire.mate.service.gateway.dto.WireMockResponseDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Component
public class WireMockGateway {

    private static final Logger log = LoggerFactory.getLogger(WireMockGateway.class);

    private final RestClient wiremockRestClient;
    private final WireMateProperties.WireMock cfg;

    public WireMockGateway(
            RestClient wiremockRestClient,
            WireMateProperties properties
    ) {
        this.wiremockRestClient = wiremockRestClient;
        this.cfg = properties.wiremock();
    }

    public void publishStub(final String payload, final UUID stubId) {
        try {
            wiremockRestClient
                    .method(HttpMethod.POST)
                    .uri(cfg.mainPath())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException ex) {
            throw new WireMockExc("Failed to publish stub id: '" + stubId + "' to WireMock", ex);
        }
    }

    public void updateStub(final String payload, final UUID stubId) {
        try {
            wiremockRestClient
                    .method(HttpMethod.PUT)
                    .uri(cfg.mainPath() + "/" + stubId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
        } catch (HttpClientErrorException.NotFound ex) {
            log.info("Stub {} not found in WireMock during update; falling back to create.", stubId);
            publishStub(payload, stubId);
        } catch (RestClientException ex) {
            throw new WireMockExc("Failed to update stub id: '" + stubId + "' to WireMock", ex);
        }
    }

    public WireMockResponseDto getAllStubs() {
        try {
            return wiremockRestClient
                    .method(HttpMethod.GET)
                    .uri(cfg.mainPath())
                    .contentType(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .body(WireMockResponseDto.class);
        } catch (RestClientException ex) {
            throw new WireMockExc("Failed to fetch stubs from WireMock", ex);
        }
    }

    public void getById(final UUID stubId) throws WireMockNotFoundExe {
        try {
            wiremockRestClient
                    .method(HttpMethod.GET)
                    .uri(cfg.mainPath() + "/" + stubId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .toBodilessEntity();
        } catch (HttpClientErrorException.NotFound ex) {
            throw new WireMockNotFoundExe("WireMock id: " + stubId + " has not been found in WireMock");
        } catch (RestClientException ex) {
            throw new WireMockExc("Failed to fetch WireMock Stub id: '" + stubId + "' from WireMock", ex);
        }
    }

    public Set<String> getAllMappingIds() {
        return getAllStubs().mappings().stream().map(MappingDto::id).collect(Collectors.toSet());
    }

    public void removeByMetadata(final String metadata) {
        try {
            wiremockRestClient
                    .method(HttpMethod.POST)
                    .uri(cfg.mainPath() + "/remove-by-metadata")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(metadata)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException ex) {
            throw new WireMockExc("Failed to remove WireMock mappings by metadata", ex);
        }
    }

    public void deleteStub(UUID stubId) throws WireMockNotFoundExe {
        try {
            wiremockRestClient
                    .method(HttpMethod.DELETE)
                    .uri(cfg.mainPath() + "/" + stubId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .retrieve()
                    .toBodilessEntity();
        } catch (HttpClientErrorException.NotFound ex) {
            throw new WireMockNotFoundExe("WireMock id: " + stubId + "has not being found in WireMock");
        } catch (RestClientException ex) {
            throw new WireMockExc("Failed to delete WireMock Stub id: '" + stubId + "' to WireMock", ex);
        }
    }

}
