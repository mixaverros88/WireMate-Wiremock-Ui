package com.wire.mate.service.entity.mock;

import com.wire.mate.service.dto.mock.MockResponse;
import com.wire.mate.service.entity.BaseEntity;
import com.wire.mate.service.entity.Project;
import com.wire.mate.service.gateway.dto.WiremockReq;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Entity
@Table(name = "mocks")
public class Mock extends BaseEntity {

    private String name;
    private String description;
    private boolean persistent;
    private int priority;
    private String curl;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> requestDefinition;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> responseDefinition;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private List<Map<String, Object>> serveEventListeners;

    public Mock() {
    }

    public Mock(
            String name,
            String description,
            Project project,
            Map<String, Object> requestDefinition,
            Map<String, Object> responseDefinition,
            boolean persistent,
            int priority,
            Map<String, Object> metadata,
            List<Map<String, Object>> serveEventListeners,
            String curl
    ) {
        this.name = name;
        this.description = description;
        this.project = project;
        this.requestDefinition = requestDefinition;
        this.responseDefinition = responseDefinition;
        this.persistent = persistent;
        this.priority = priority;
        this.metadata = metadata;
        this.serveEventListeners = serveEventListeners;
        this.curl = curl;
    }

    public Mock(Mock other, Project project) {
        this.name = other.name;
        this.description = other.description;
        this.persistent = other.persistent;
        this.priority = other.priority;
        this.curl = other.curl;
        this.project = project;
        this.requestDefinition = other.requestDefinition != null ? new HashMap<>(other.requestDefinition) : null;
        this.responseDefinition = other.responseDefinition != null ? new HashMap<>(other.responseDefinition) : null;
        this.metadata = other.metadata != null ? new HashMap<>(other.metadata) : null;
        this.serveEventListeners = other.serveEventListeners != null
                ? other.serveEventListeners.stream().map(HashMap::new).collect(Collectors.toList())
                : null;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Project getProject() {
        return project;
    }

    public void setProject(Project project) {
        this.project = project;
    }

    public Map<String, Object> getRequestDefinition() {
        return requestDefinition;
    }

    public void setRequestDefinition(Map<String, Object> requestDefinition) {
        this.requestDefinition = requestDefinition;
    }

    public Map<String, Object> getResponseDefinition() {
        return responseDefinition;
    }

    public void setResponseDefinition(Map<String, Object> responseDefinition) {
        this.responseDefinition = responseDefinition;
    }

    public boolean isPersistent() {
        return persistent;
    }

    public void setPersistent(boolean persistent) {
        this.persistent = persistent;
    }

    public int getPriority() {
        return priority;
    }

    public void setPriority(int priority) {
        this.priority = priority;
    }

    public Map<String, Object> getMetadata() {
        return metadata;
    }

    public void setMetadata(Map<String, Object> metadata) {
        this.metadata = metadata;
    }

    public List<Map<String, Object>> getServeEventListeners() {
        return serveEventListeners;
    }

    public void setServeEventListeners(List<Map<String, Object>> serveEventListeners) {
        this.serveEventListeners = serveEventListeners;
    }

    public String getCurl() {
        return curl;
    }

    public void setCurl(String curl) {
        this.curl = curl;
    }

    public MockResponse toDto() {
        return new MockResponse(
                this.getId(),
                this.name,
                this.description,
                this.project.getId(),
                this.project.getName(),
                this.requestDefinition,
                this.responseDefinition,
                this.persistent,
                this.priority,
                this.metadata,
                this.serveEventListeners,
                this.curl,
                this.getCreatedAt()
        );
    }

    public WiremockReq toWiremockRequest() {
        return new WiremockReq(
                this.getId(),
                this.name,
                this.requestDefinition,
                this.responseDefinition,
                this.serveEventListeners,
                this.persistent,
                this.priority,
                this.metadata
        );
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Mock other)) return false;
        return getId() != null && getId().equals(other.getId());
    }

    @Override
    public int hashCode() {
        // Use a constant so that hash/equals contract holds for unsaved entities
        // and remains stable while the entity moves through different sets/maps.
        return getClass().hashCode();
    }

}