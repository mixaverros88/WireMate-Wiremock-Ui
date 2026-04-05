# Rule: Entities Must Be Placed in the `entity` Package

## Guideline

All JPA entities and mapped superclasses must be placed in the `entity` package, following the package-by-layer structure (see rule: package-by-layer-structure).

```
// ✅ Correct
com.example.project.entity.Project
com.example.project.entity.User
com.example.project.entity.Order
com.example.project.entity.BaseEntity

// ❌ Avoid
com.example.project.project.Project    ← feature package
com.example.project.model.Project      ← wrong layer name
com.example.project.Project            ← root package
```

## What belongs in `entity/`

- Classes annotated with `@Entity`
- Classes annotated with `@MappedSuperclass` (e.g. `BaseEntity` with auditing fields)
- Enums used exclusively as entity field types can live here too
- Repository query projections — interface projections and `SELECT new ...`
  records (see rule: jpa-query-projection)

## Sub-packages per domain

When a domain has more than one persistence type — its entity plus one or more
projections (or domain-specific enums) — group them in a sub-package named
after the domain, mirroring how `dto/` is organized (`dto/mock/`,
`dto/project/`):

```
// ✅ Correct — Mock has an entity AND a projection → own sub-package
entity/
├── BaseEntity.java          ← shared base stays at the root
├── Project.java             ← single type → stays at the root
├── Notification.java
└── mock/
    ├── Mock.java
    └── MockIdProjectId.java

// ❌ Avoid — multiple types of the same domain loose at the root
entity/
├── Mock.java
├── MockIdProjectId.java
└── ...
```

- A domain with only its entity stays at the `entity/` root — do not create
  single-file sub-packages preemptively.
- Move the domain into a sub-package the moment its second type appears.
- `BaseEntity` and other cross-domain types always stay at the root.

## What does NOT belong in `entity/`

- DTOs or response records → go in `dto/` (see rule: dto-must-be-record)
- Repository interfaces → go in `repository/`
- No service logic, no controller references, no DTO imports inside entities

## Base entity example

```java
// entity/BaseEntity.java
@MappedSuperclass
public abstract class BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}

// entity/Project.java
@Entity
@Table(name = "projects")
public class Project extends BaseEntity {
    private String name;
    private String description;
    private LocalDate deadline;
}
```

## Rationale

- Consistent with the package-by-layer convention across the whole project
- Clear separation between persistence model (`entity/`) and API model (`dto/`)
- All entities are immediately discoverable in one place
