# Rule: Use @Transactional(readOnly = true) on Fetch Methods in Services

## Guideline

Any service method that **only reads data** (no insert, update, or delete) must be annotated with `@Transactional(readOnly = true)`:

```java
// ✅ Preferred
@Transactional(readOnly = true)
public List<ProjectResponse> getAllProjects() {
    return projectRepository.findAll()
        .stream()
        .map(mapper::toResponse)
        .toList();
}

// ❌ Avoid — missing annotation on a read-only method
public List<ProjectResponse> getAllProjects() {
    return projectRepository.findAll()
        .stream()
        .map(mapper::toResponse)
        .toList();
}
```

## When to use `readOnly = true`

- `getById`, `getAll`, `findBy*`, `exists*`, or any method that only fetches entities
- Methods that map entities to DTOs/responses without mutating state
- Methods used in `@GetMapping` controller endpoints

## When NOT to use `readOnly = true`

- Methods that save, update, or delete entities — use plain `@Transactional` instead
- Methods that mix reads and writes in the same transaction

## Rationale

- Tells the JPA provider (Hibernate) to skip dirty checking at flush time — less overhead per transaction
- Allows the database/driver to route the query to a read replica if configured
- Acts as documentation — makes intent of the method immediately clear
- Can prevent accidental writes inside what should be a read-only operation
