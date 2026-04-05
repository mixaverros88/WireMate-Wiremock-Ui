-- V1: Initial schema for WireMate.
-- Mirrors the JPA entity definitions; ddl-auto=validate will fail-fast on drift.

CREATE TABLE projects (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE mocks (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  VARCHAR(255) NOT NULL,
    description           VARCHAR(1024),
    project_id            UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    request_definition    JSONB        NOT NULL,
    response_definition   JSONB        NOT NULL,
    persistent            BOOLEAN      NOT NULL DEFAULT false,
    priority              INTEGER      NOT NULL DEFAULT 5,
    metadata              JSONB        NOT NULL DEFAULT '{}'::jsonb,
    serve_event_listeners JSONB,
    curl                  TEXT,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_mock_name_per_project UNIQUE (name, project_id)
);

CREATE INDEX idx_mocks_project_id_created_at ON mocks (project_id, created_at DESC);

CREATE TABLE notifications (
    id         BIGSERIAL    PRIMARY KEY,
    name       TEXT         NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Backoffice paginates notifications by created_at DESC; this index makes that
-- query index-only without touching the heap.
CREATE INDEX idx_notifications_created_at_desc ON notifications (created_at DESC);
