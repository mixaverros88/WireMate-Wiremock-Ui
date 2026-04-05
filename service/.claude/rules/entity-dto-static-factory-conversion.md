# Rule: Entity ↔ DTO Conversion Must Use Static Factory Methods

## Guideline

Conversion between entities and DTOs must be done via **static factory methods** defined directly on the record or entity class. Never use external mapper classes, MapStruct, or inline manual mapping scattered across services.

## `toDto()` — defined on the Entity

The entity is responsible for producing its DTO representation:

```java
// entity/Project.java
@Entity
@Table(name = "projects")
public class Project extends BaseEntity {

    private String name;
    private String description;
    private LocalDate deadline;

    public static Project fromDto(ProjectRequest request) {
        Project project = new Project();
        project.setName(request.name());
        project.setDescription(request.description());
        project.setDeadline(request.deadline());
        return project;
    }

    public ProjectResponse toDto() {
        return new ProjectResponse(
            this.getId(),
            this.name,
            this.description,
            this.deadline
        );
    }
}
```

## `fromDto()` / `toEntity()` — defined on the DTO record

The DTO record exposes a static factory method to produce an entity from itself:

```java
// dto/ProjectRequest.java
public record ProjectRequest(
    @NotBlank String name,
    @Size(max = 500) String description,
    @Future LocalDate deadline
) {
    public Project toEntity() {
        Project project = new Project();
        project.setName(this.name);
        project.setDescription(this.description);
        project.setDeadline(this.deadline);
        return project;
    }
}
```

## Usage in the service layer

```java
// ✅ Correct — conversion via static factory methods
@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;

    @Transactional(readOnly = true)
    public List<ProjectResponse> getAllProjects() {
        return projectRepository.findAll().stream()
            .map(Project::toDto)
            .toList();
    }

    @Transactional(readOnly = true)
    public ProjectResponse getProjectById(Long id) {
        return projectRepository.findById(id)
            .map(Project::toDto)
            .orElseThrow(() -> new ProjectNotFoundException(id));
    }

    public ProjectResponse createProject(ProjectRequest request) {
        Project saved = projectRepository.save(request.toEntity());
        return saved.toDto();
    }
}

// ❌ Avoid — inline manual mapping in service
public ProjectResponse createProject(ProjectRequest request) {
    Project project = new Project();
    project.setName(request.name());       // mapping logic leaking into service
    project.setDescription(request.description());
    Project saved = projectRepository.save(project);
    return new ProjectResponse(saved.getId(), saved.getName(), saved.getDescription(), saved.getDeadline());
}

// ❌ Avoid — external mapper class
@Component
public class ProjectMapper {
    public ProjectResponse toDto(Project project) { ... }
    public Project toEntity(ProjectRequest request) { ... }
}
```

## Convention summary

| Method | Defined on | Returns | Direction |
|--------|------------|---------|-----------|
| `toDto()` | Entity | Response DTO record | Entity → DTO |
| `toEntity()` | Request DTO record | Entity | DTO → Entity |
| `fromDto(Dto dto)` | Entity (static) | Entity | Alternative DTO → Entity |

## Rationale

- **Cohesion** — conversion logic lives with the type it knows best
- **No extra classes** — eliminates `ProjectMapper`, `UserMapper`, `OrderMapper` boilerplate
- **Readable service layer** — services stay focused on orchestration, not field-by-field mapping
- **Refactor-safe** — adding a field to the entity or DTO means updating one method in one place
- **Works naturally with streams** — `list.stream().map(Project::toDto).toList()` is expressive and clean
