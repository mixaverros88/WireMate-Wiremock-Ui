package com.wire.mate.service.service;

import com.wire.mate.service.dto.notification.NotificationResponse;
import com.wire.mate.service.entity.Notification;
import com.wire.mate.service.exception.NotFoundExc;
import com.wire.mate.service.repository.NotificationRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {

    private final NotificationRepository repository;

    public NotificationService(NotificationRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public Page<NotificationResponse> getNotifications(Pageable pageable) {
        return repository.findAll(pageable).map(Notification::toDto);
    }

    @Transactional
    public void delete(final Long notificationId) {
        Notification notification = repository
                .findById(notificationId)
                .orElseThrow(() -> new NotFoundExc("Notification ID: " + notificationId));
        repository.delete(notification);
    }

    @Transactional
    public void deleteAll() {
        repository.deleteAllInBatch();
    }

}
