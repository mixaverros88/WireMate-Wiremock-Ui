# Rule: Dependency Injection Must Use Constructor Injection Only

## Guideline

Always inject dependencies via the constructor. Never use field injection (`@Autowired` on a field) or setter injection.

```java
// ✅ Preferred — constructor injection
@Service
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final ProjectMapper projectMapper;

    public ProjectService(ProjectRepository projectRepository, ProjectMapper projectMapper) {
        this.projectRepository = projectRepository;
        this.projectMapper = projectMapper;
    }
}

// ❌ Avoid — field injection
@Service
public class ProjectService {

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private ProjectMapper projectMapper;
}

// ❌ Avoid — setter injection
@Service
public class ProjectService {

    private ProjectRepository projectRepository;

    @Autowired
    public void setProjectRepository(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }
}
```

## Lombok shortcut

If the class uses Lombok, use `@RequiredArgsConstructor` to avoid writing the constructor manually.
All fields must be `final` for this to work:

```java
// ✅ Preferred with Lombok
@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final ProjectMapper projectMapper;
}
```

## Rules

- All injected fields must be `private final`
- `@Autowired` is not needed on constructors when there is only one constructor (Spring infers it automatically)
- Never put `@Autowired` on a field under any circumstance
- If a class has too many constructor parameters (more than 4-5), treat it as a signal the class has too many responsibilities and should be split

## Rationale

- **Immutability** — `final` fields cannot be reassigned after construction
- **Testability** — dependencies can be passed directly in unit tests without a Spring context or reflection
- **Fail-fast** — a missing bean causes a startup failure, not a `NullPointerException` at runtime
- **No hidden dependencies** — all dependencies are explicit and visible in the constructor signature
- **Circular dependency detection** — Spring catches circular dependencies at startup with constructor injection, whereas field injection silently allows them
