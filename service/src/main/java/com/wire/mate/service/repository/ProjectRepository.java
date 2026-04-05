package com.wire.mate.service.repository;

import com.wire.mate.service.entity.Project;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface ProjectRepository extends JpaRepository<Project, UUID> {

    boolean existsByName(String name);
}
