package com.wire.mate.service.task;

import com.wire.mate.service.entity.Notification;
import com.wire.mate.service.gateway.WireMockGateway;
import com.wire.mate.service.repository.MockRepository;
import com.wire.mate.service.repository.NotificationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Component
@ConditionalOnProperty(prefix = "app.cross-check", name = "enabled", havingValue = "true", matchIfMissing = true)
public class CrossCheckTask {

    private static final Logger log = LoggerFactory.getLogger(CrossCheckTask.class);

    private final MockRepository mockRepository;
    private final WireMockGateway wireMockGateway;
    private final NotificationRepository notificationRepository;

    public CrossCheckTask(
            MockRepository mockRepository,
            WireMockGateway wireMockGateway,
            NotificationRepository notificationRepository
    ) {
        this.mockRepository = mockRepository;
        this.wireMockGateway = wireMockGateway;
        this.notificationRepository = notificationRepository;
    }

    // initialDelay matches the interval: fixedDelay alone fires immediately at
    // startup, when WireMock may not be up yet (and mid-bootstrap in tests).
    @Scheduled(
            initialDelayString = "${app.cross-check.interval}",
            fixedDelayString = "${app.cross-check.interval}"
    )
    public void execute() {
        Set<String> wireMockStubs = wireMockGateway.getAllMappingIds();
        Map<String, String> databaseMocks = loadDatabaseMockProjectIds();
        recordDrift(databaseMocks, wireMockStubs);
    }

    /**
     * Map of each WireMate mock id to its parent project id (both as strings).
     * The project id is needed to build the deep link into the mock editor for
     * "in WireMate but not in WireMock" notifications.
     */
    @Transactional(readOnly = true)
    protected Map<String, String> loadDatabaseMockProjectIds() {
        return mockRepository
                .findAllIdProjectIdPairsBy()
                .stream()
                .collect(Collectors.toMap(
                        pair -> pair.getId().toString(),
                        pair -> pair.getProject().getId().toString()
                ));
    }

    @Transactional
    protected void recordDrift(Map<String, String> databaseMocks, Set<String> wireMockStubs) {
        Set<String> databaseStubs = databaseMocks.keySet();

        Set<String> missingFromWireMock = new HashSet<>(databaseStubs);
        missingFromWireMock.removeAll(wireMockStubs);

        Set<String> missingFromDb = new HashSet<>(wireMockStubs);
        missingFromDb.removeAll(databaseStubs);

        if (missingFromWireMock.isEmpty() && missingFromDb.isEmpty()) {
            return;
        }

        List<Notification> batch = new ArrayList<>(missingFromWireMock.size() + missingFromDb.size());

        missingFromWireMock.stream()
                .map(id -> new Notification(wireMateOnlyMessage(id, databaseMocks.get(id))))
                .forEach(batch::add);

        missingFromDb.stream()
                .map(id -> new Notification(wireMockOnlyMessage(id)))
                .forEach(batch::add);

        notificationRepository.saveAll(batch);
        log.info("Cross-check produced {} drift notifications ({} WireMate-only, {} WireMock-only).", batch.size(), missingFromWireMock.size(), missingFromDb.size());
    }

    /**
     * Message for a mock that exists in WireMate but is missing from WireMock.
     * The mock id is wrapped in a relative anchor into the WireMate mock editor
     * so the user can jump straight to it and re-publish. The href is relative
     * (no host) so it works across environments (dev :5173, Docker :3000); the
     * UI sanitises and renders it via the notification body's allow-list
     * (anchors are permitted, `/`-relative hrefs pass). Falls back to the bare
     * id if the project id is somehow absent.
     */
    static String wireMateOnlyMessage(String mockId, String projectId) {
        String idHtml = projectId != null && !projectId.isBlank()
                ? "<a href=\"/projects/" + projectId + "/mocks/" + mockId + "/edit\">" + mockId + "</a>"
                : mockId;
        return "Mock " + idHtml + " is in WireMate but not in WireMock";
    }

    /**
     * Message for a stub that exists in WireMock but has no WireMate mock. There
     * is no editor to deep-link into (it isn't a WireMate mock), so the id links
     * to the read-only stub detail page instead.
     */
    static String wireMockOnlyMessage(String stubId) {
        return "Mock <a href=\"/stubs/" + stubId + "\">" + stubId + "</a> is in WireMock but not in WireMate";
    }
}
