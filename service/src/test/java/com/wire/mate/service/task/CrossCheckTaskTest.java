package com.wire.mate.service.task;

import com.wire.mate.service.entity.mock.MockIdProjectId;
import com.wire.mate.service.entity.Notification;
import com.wire.mate.service.gateway.WireMockGateway;
import com.wire.mate.service.repository.MockRepository;
import com.wire.mate.service.repository.NotificationRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrossCheckTaskTest {

    @Mock private MockRepository mockRepository;
    @Mock private WireMockGateway wireMockGateway;
    @Mock private NotificationRepository notificationRepository;

    @InjectMocks private CrossCheckTask task;

    /** Build the {@code [id, projectId]} rows the repository projection returns. */
    private static List<MockIdProjectId> pairs(Map<UUID, UUID> idToProject) {
        return idToProject.entrySet().stream()
                .map(e -> (MockIdProjectId) new MockIdProjectId() {
                    @Override
                    public UUID getId() {
                        return e.getKey();
                    }

                    @Override
                    public ProjectRef getProject() {
                        return e::getValue;
                    }
                })
                .toList();
    }

    @Nested
    @DisplayName("execute")
    class Execute {

        @Test
        @DisplayName("no drift: does not call saveAll")
        void noDrift() {
            var a = UUID.randomUUID();
            var b = UUID.randomUUID();
            var proj = UUID.randomUUID();
            when(mockRepository.findAllIdProjectIdPairsBy())
                    .thenReturn(pairs(Map.of(a, proj, b, proj)));
            when(wireMockGateway.getAllMappingIds())
                    .thenReturn(Set.of(a.toString(), b.toString()));

            task.execute();

            verify(notificationRepository, never()).saveAll(any());
        }

        @Test
        @DisplayName("DB has extras: one notification per missing-from-WireMock id, linking to the mock editor")
        void missingFromWireMock() {
            var inBoth = UUID.randomUUID();
            var onlyDb = UUID.randomUUID();
            var proj = UUID.randomUUID();
            when(mockRepository.findAllIdProjectIdPairsBy())
                    .thenReturn(pairs(Map.of(inBoth, proj, onlyDb, proj)));
            when(wireMockGateway.getAllMappingIds()).thenReturn(Set.of(inBoth.toString()));

            task.execute();

            ArgumentCaptor<List<Notification>> captor = ArgumentCaptor.captor();
            verify(notificationRepository).saveAll(captor.capture());
            assertThat(captor.getValue()).hasSize(1);
            assertThat(captor.getValue().get(0).getName())
                    .contains(onlyDb.toString())
                    .contains("is in WireMate but not in WireMock")
                    .contains("href=\"/projects/" + proj + "/mocks/" + onlyDb + "/edit\"");
        }

        @Test
        @DisplayName("WireMock has extras: one notification per missing-from-DB id, linking to the stub page")
        void missingFromDb() {
            var inBoth = UUID.randomUUID();
            var onlyWm = UUID.randomUUID().toString();
            var proj = UUID.randomUUID();
            when(mockRepository.findAllIdProjectIdPairsBy())
                    .thenReturn(pairs(Map.of(inBoth, proj)));
            when(wireMockGateway.getAllMappingIds())
                    .thenReturn(Set.of(inBoth.toString(), onlyWm));

            task.execute();

            ArgumentCaptor<List<Notification>> captor = ArgumentCaptor.captor();
            verify(notificationRepository).saveAll(captor.capture());
            assertThat(captor.getValue()).hasSize(1);
            assertThat(captor.getValue().get(0).getName())
                    .contains(onlyWm)
                    .contains("is in WireMock but not in WireMate")
                    .contains("href=\"/stubs/" + onlyWm + "\"");
        }

        @Test
        @DisplayName("both sides have drift: total notifications = sum of both diffs")
        void bidirectionalDrift() {
            var dbOnly1 = UUID.randomUUID();
            var dbOnly2 = UUID.randomUUID();
            var proj = UUID.randomUUID();
            var wmOnly1 = UUID.randomUUID().toString();
            when(mockRepository.findAllIdProjectIdPairsBy())
                    .thenReturn(pairs(Map.of(dbOnly1, proj, dbOnly2, proj)));
            when(wireMockGateway.getAllMappingIds()).thenReturn(Set.of(wmOnly1));

            task.execute();

            ArgumentCaptor<List<Notification>> captor = ArgumentCaptor.captor();
            verify(notificationRepository).saveAll(captor.capture());
            assertThat(captor.getValue()).hasSize(3);
        }

        @Test
        @DisplayName("both sides empty: no save call")
        void bothEmpty() {
            when(mockRepository.findAllIdProjectIdPairsBy()).thenReturn(List.of());
            when(wireMockGateway.getAllMappingIds()).thenReturn(Set.of());

            task.execute();

            verify(notificationRepository, never()).saveAll(any());
        }

        @Test
        @DisplayName("when wireMockGateway throws, exception propagates and saveAll is never called")
        void gatewayThrows() {
            when(wireMockGateway.getAllMappingIds())
                    .thenThrow(new RuntimeException("wiremock down"));

            assertThatThrownBy(() -> task.execute())
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("wiremock down");

            verify(notificationRepository, never()).saveAll(any());
        }

        @Test
        @DisplayName("when mockRepository throws, exception propagates and saveAll is never called")
        void mockRepoThrows() {
            when(wireMockGateway.getAllMappingIds()).thenReturn(Set.of());
            when(mockRepository.findAllIdProjectIdPairsBy())
                    .thenThrow(new RuntimeException("db down"));

            assertThatThrownBy(() -> task.execute())
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("db down");

            verify(notificationRepository, never()).saveAll(any());
        }

        @Test
        @DisplayName("when WireMock returns a non-UUID id, it appears as drift (wm-only)")
        void nonUuidIdFromWireMock() {
            var dbId = UUID.randomUUID();
            var proj = UUID.randomUUID();
            when(mockRepository.findAllIdProjectIdPairsBy())
                    .thenReturn(pairs(Map.of(dbId, proj)));
            // WireMock can hold arbitrary string ids — they should still be diffed correctly
            when(wireMockGateway.getAllMappingIds())
                    .thenReturn(Set.of(dbId.toString(), "not-a-uuid"));

            task.execute();

            ArgumentCaptor<List<Notification>> captor = ArgumentCaptor.captor();
            verify(notificationRepository).saveAll(captor.capture());
            assertThat(captor.getValue()).hasSize(1);
            assertThat(captor.getValue().get(0).getName())
                    .contains("not-a-uuid")
                    .contains("is in WireMock but not in WireMate");
        }

        @Test
        @DisplayName("large input: drift count matches set difference")
        void largeInput() {
            var proj = UUID.randomUUID();
            Set<UUID> db = Stream.generate(UUID::randomUUID).limit(500).collect(Collectors.toSet());
            Map<UUID, UUID> dbPairs = db.stream().collect(Collectors.toMap(id -> id, id -> proj));
            Set<String> wm = new HashSet<>(db.stream().limit(450).map(UUID::toString).toList());
            // Add 20 wm-only ids
            for (int i = 0; i < 20; i++) wm.add(UUID.randomUUID().toString());

            when(mockRepository.findAllIdProjectIdPairsBy()).thenReturn(pairs(dbPairs));
            when(wireMockGateway.getAllMappingIds()).thenReturn(wm);

            task.execute();

            ArgumentCaptor<List<Notification>> captor = ArgumentCaptor.captor();
            verify(notificationRepository).saveAll(captor.capture());
            // 50 db-only (500 - 450) + 20 wm-only = 70
            assertThat(captor.getValue()).hasSize(70);
        }
    }

    @Nested
    @DisplayName("message builders")
    class Messages {

        @Test
        @DisplayName("WireMate-only: wraps the mock id in a relative editor link")
        void wireMateOnlyBuildsEditLink() {
            var mockId = UUID.randomUUID().toString();
            var projectId = UUID.randomUUID().toString();

            String msg = CrossCheckTask.wireMateOnlyMessage(mockId, projectId);

            assertThat(msg).isEqualTo(
                    "Mock <a href=\"/projects/" + projectId + "/mocks/" + mockId
                            + "/edit\">" + mockId + "</a> is in WireMate but not in WireMock");
        }

        @Test
        @DisplayName("WireMate-only: falls back to the bare id when project id is missing")
        void wireMateOnlyFallsBackWithoutProject() {
            var mockId = UUID.randomUUID().toString();

            assertThat(CrossCheckTask.wireMateOnlyMessage(mockId, null))
                    .isEqualTo("Mock " + mockId + " is in WireMate but not in WireMock")
                    .doesNotContain("<a");
            assertThat(CrossCheckTask.wireMateOnlyMessage(mockId, "  "))
                    .doesNotContain("<a");
        }

        @Test
        @DisplayName("WireMock-only: wraps the stub id in a relative stub-detail link")
        void wireMockOnlyBuildsStubLink() {
            var stubId = UUID.randomUUID().toString();

            String msg = CrossCheckTask.wireMockOnlyMessage(stubId);

            assertThat(msg).isEqualTo(
                    "Mock <a href=\"/stubs/" + stubId + "\">" + stubId
                            + "</a> is in WireMock but not in WireMate");
        }
    }
}
