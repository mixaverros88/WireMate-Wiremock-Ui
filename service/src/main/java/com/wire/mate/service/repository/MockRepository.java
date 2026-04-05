package com.wire.mate.service.repository;

import com.wire.mate.service.entity.mock.Mock;
import com.wire.mate.service.entity.mock.MockIdProjectId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface MockRepository extends JpaRepository<Mock, UUID> {

    boolean existsByNameAndProjectId(String name, UUID projectId);

    /**
     * Checks all four mutually exclusive WireMock URL match keys (see
     * {@code Util.URL_MATCH_KEYS}) — a duplicate created with {@code urlPattern}
     * or {@code urlPathPattern} must be detected too.
     */
    @Query(value = """
            SELECT EXISTS (
                SELECT 1 FROM mocks
                WHERE project_id = :projectId
                  AND (request_definition ->> 'urlPath' = :url
                       OR request_definition ->> 'url' = :url
                       OR request_definition ->> 'urlPattern' = :url
                       OR request_definition ->> 'urlPathPattern' = :url)
            )
            """, nativeQuery = true)
    boolean existsByUrlAndProjectId(@Param("url") String url, @Param("projectId") UUID projectId);

    List<MockIdProjectId> findAllIdProjectIdPairsBy();
}
