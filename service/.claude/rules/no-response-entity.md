# Rule: Avoid ResponseEntity in Controller Methods

## Guideline

Do **not** wrap controller return types in `ResponseEntity<T>` unless there is a specific reason to do so.

Return the domain/DTO type directly:

```java
// ✅ Preferred
@GetMapping
public List<ProjectResponse> getAllProjects() {
    return service.getAllProjects();
}

// ❌ Avoid
@GetMapping
public ResponseEntity<List<ProjectResponse>> getAllProjects() {
    return ResponseEntity.ok(service.getAllProjects());
}
```

## Acceptable exceptions

Use `ResponseEntity` only when you genuinely need HTTP-level control:

- **Conditional status codes** — e.g. returning `204 No Content` vs `200 OK` based on logic
- **Custom response headers** — e.g. `Content-Disposition`, pagination headers, `X-Custom-*`
- **Different response bodies per outcome** — e.g. returning an error body on one branch and a success body on another

## Rationale

- Reduces boilerplate on standard CRUD endpoints
- Keeps method signatures focused on domain types, not transport concerns
- Spring MVC handles `200 OK` + JSON serialization automatically for direct returns
- `@ResponseStatus` can be used on the method or exception class if a non-200 default is needed
