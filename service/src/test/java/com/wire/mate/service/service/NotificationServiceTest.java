package com.wire.mate.service.service;

import com.wire.mate.service.dto.notification.NotificationResponse;
import com.wire.mate.service.entity.Notification;
import com.wire.mate.service.exception.NotFoundExc;
import com.wire.mate.service.repository.NotificationRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock private NotificationRepository repository;

    @InjectMocks private NotificationService service;

    @Nested
    @DisplayName("getNotifications")
    class GetNotifications {

        @Test
        @DisplayName("returns empty page when repo is empty")
        void empty() {
            var pageable = PageRequest.of(0, 10);
            when(repository.findAll(pageable)).thenReturn(Page.empty(pageable));

            Page<NotificationResponse> result = service.getNotifications(pageable);

            assertThat(result.getContent()).isEmpty();
            assertThat(result.getTotalElements()).isZero();
        }

        @Test
        @DisplayName("passes Pageable through unchanged")
        void pageablePassedThrough() {
            var pageable = PageRequest.of(2, 5);
            when(repository.findAll(any(Pageable.class))).thenReturn(Page.empty(pageable));

            service.getNotifications(pageable);

            var captor = ArgumentCaptor.forClass(Pageable.class);
            verify(repository).findAll(captor.capture());
            assertThat(captor.getValue()).isEqualTo(pageable);
        }

        @Test
        @DisplayName("maps each Notification through toDto")
        void mapsContent() {
            var n = new Notification("drift");
            n.setId(42L);
            var pageable = PageRequest.of(0, 10);
            when(repository.findAll(pageable))
                    .thenReturn(new PageImpl<>(List.of(n), pageable, 1));

            var page = service.getNotifications(pageable);

            assertThat(page.getContent()).singleElement()
                    .satisfies(r -> {
                        assertThat(r.id()).isEqualTo(42L);
                        assertThat(r.name()).isEqualTo("drift");
                    });
        }
    }

    @Nested
    @DisplayName("delete")
    class Delete {

        @Test
        @DisplayName("throws NotFoundExc when id missing")
        void notFound() {
            when(repository.findById(99L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.delete(99L))
                    .isInstanceOf(NotFoundExc.class)
                    .hasMessageContaining("99");

            verify(repository, never()).delete(any());
        }

        @Test
        @DisplayName("deletes the loaded entity")
        void happyPath() {
            var n = new Notification("x");
            n.setId(7L);
            when(repository.findById(7L)).thenReturn(Optional.of(n));

            service.delete(7L);

            verify(repository).delete(n);
        }
    }

    @Nested
    @DisplayName("deleteAll")
    class DeleteAll {

        @Test
        @DisplayName("calls deleteAllInBatch (not delete)")
        void delegates() {
            service.deleteAll();

            verify(repository).deleteAllInBatch();
        }
    }
}
