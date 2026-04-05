package com.wire.mate.service.integration;

import com.wire.mate.service.entity.Notification;
import com.wire.mate.service.repository.NotificationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Repository-layer IT — small surface, exercises pagination / batch-delete / @PrePersist.
 */
class NotificationRepositoryIT extends IntegrationTestBase {

    @Autowired NotificationRepository repository;
    @Autowired JdbcTemplate jdbcTemplate;

    @BeforeEach
    void cleanDb() {
        jdbcTemplate.execute("TRUNCATE TABLE notifications RESTART IDENTITY CASCADE");
    }

    @Test
    @DisplayName("@PrePersist populates createdAt on save")
    void prePersistTimestamp() {
        var saved = repository.saveAndFlush(new Notification("hello"));

        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getCreatedAt()).isNotNull();
    }

    @Test
    @DisplayName("pagination: 25 rows, page 2 size 10 returns 5 elements and totalPages=3")
    void pagination() {
        IntStream.range(0, 25).forEach(i -> repository.save(new Notification("n-" + i)));
        repository.flush();

        var page = repository.findAll(PageRequest.of(2, 10, Sort.by(Sort.Direction.DESC, "createdAt")));

        assertThat(page.getTotalElements()).isEqualTo(25);
        assertThat(page.getTotalPages()).isEqualTo(3);
        assertThat(page.getNumber()).isEqualTo(2);
        assertThat(page.getContent()).hasSize(5);
    }

    @Test
    @DisplayName("deleteAllInBatch clears table in one statement")
    void batchDelete() {
        repository.save(new Notification("a"));
        repository.save(new Notification("b"));
        repository.flush();

        repository.deleteAllInBatch();

        assertThat(repository.count()).isZero();
    }
}
