package com.wire.mate.service.controller;

import com.wire.mate.service.dto.notification.NotificationResponse;
import com.wire.mate.service.service.NotificationService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.SortDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/backoffice")
public class BackofficeController {

    private final NotificationService service;

    public BackofficeController(NotificationService service) {
        this.service = service;
    }

    @GetMapping("/notifications")
    @ResponseStatus(HttpStatus.OK)
    public Page<NotificationResponse> getAllNotifications(@SortDefault(sort = "createdAt") Pageable pageable) {
        return service.getNotifications(pageable);
    }

    @DeleteMapping("/notifications/{notificationId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteNotification(@PathVariable Long notificationId) {
        service.delete(notificationId);
    }

    @DeleteMapping("/notifications")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAllNotifications() {
        service.deleteAll();
    }

}
