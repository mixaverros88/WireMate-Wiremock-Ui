# JPA query projections

Repository query methods must never return untyped `Object[]` rows
(`List<Object[]>`, `Page<Object[]>`, `Stream<Object[]>`). Callers end up
indexing into `row[0]` / `row[1]` with casts — no type safety, no names.
Use a typed projection instead. Refactor it if you find it.

Prefer a derived query with a closed interface projection — no `@Query` at all.
Spring Data selects only the projected properties, and nested interfaces walk
associations:

```java
// entity/mock/MockIdProjectId.java
public interface MockIdProjectId {
    UUID getId();
    ProjectRef getProject();

    interface ProjectRef {
        UUID getId();
    }
}

// repository/MockRepository.java — text between "find" and "By" is descriptive
List<MockIdProjectId> findAllIdProjectIdPairsBy();
```

Only when the query genuinely needs JPQL (joins Spring Data can't derive,
aggregation, filtering on JSONB, ...) use `@Query` with a record and a
constructor expression:

```java
// entity/mock/MockCountPerProject.java
public record MockCountPerProject(UUID projectId, long mockCount) {
}

// repository/MockRepository.java
@Query("SELECT new com.wire.mate.service.entity.mock.MockCountPerProject(m.project.id, COUNT(m)) FROM Mock m GROUP BY m.project.id")
List<MockCountPerProject> countMocksPerProject();
```

```java
// ❌ Avoid — untyped rows, callers must know column order
@Query("SELECT m.id, m.project.id FROM Mock m")
List<Object[]> findAllIdProjectIdPairs();

// ❌ Avoid — @Query for something a derived method + projection can express
@Query("SELECT new com.wire.mate.service.entity.mock.MockIdProjectId(m.id, m.project.id) FROM Mock m")
List<MockIdProjectId> findAllIdProjectIdPairs();
```

Rules:
- Do NOT write `@Query` when a derived method name plus a projection type can
  express the same query. Delete it if you find it.
- Constructor expressions (`SELECT new ...`) must use the record's
  fully-qualified name.
- Projection types (interfaces and records) live in `entity/` next to the
  entities they project, NOT in `dto/` or `repository/`. They are views over
  the persistence model. Once a domain has entity + projection, both go in a
  per-domain sub-package (`entity/mock/` — see rule: entity-in-entity-package).
  If the values must leave the service layer, convert to a proper `*Response`
  DTO.
- Single-column selects don't need a projection — return the column type
  directly (`List<UUID>`).
