package com.wire.mate.service.entity;

import com.wire.mate.service.dto.project.ProjectResponse;
import com.wire.mate.service.dto.project.ProjectWithMocksResponse;
import com.wire.mate.service.entity.mock.Mock;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import java.util.Comparator;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "projects")
public class Project extends BaseEntity {

    private String name;
    @OneToMany(mappedBy = "project", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<Mock> mockList = new HashSet<>();

    public Project() {
    }

    public Set<Mock> getMockList() {
        return mockList;
    }

    public void setMockList(Set<Mock> mockList) {
        this.mockList = mockList;
    }

    public Project(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public ProjectResponse toDto() {
        return new ProjectResponse(
                this.getId(),
                this.name,
                this.getCreatedAt()
        );
    }

    public ProjectWithMocksResponse toDtoWithMocks() {
        return new ProjectWithMocksResponse(
                this.getId(),
                this.name,
                this.mockList.stream()
                        .sorted(Comparator.comparing(Mock::getCreatedAt).reversed())
                        .map(Mock::toDto)
                        .toList(),
                this.getCreatedAt()
        );
    }

}
