# Rule: Every Controller Method Must Have an Explicit @ResponseStatus

## Guideline

Every controller method must declare its HTTP response status explicitly using `@ResponseStatus`.
Never rely on Spring's implicit `200 OK` default.

```java
// ✅ Preferred
@GetMapping
@ResponseStatus(HttpStatus.OK)
public List<ProjectResponse> getAllProjects() {
    return service.getAllProjects();
}

@PostMapping
@ResponseStatus(HttpStatus.CREATED)
public ProjectResponse createProject(@RequestBody @Valid ProjectRequest request) {
    return service.createProject(request);
}

@DeleteMapping("/{id}")
@ResponseStatus(HttpStatus.NO_CONTENT)
public void deleteProject(@PathVariable Long id) {
    service.deleteProject(id);
}

// ❌ Avoid — status is implicit, not declared
@GetMapping
public List<ProjectResponse> getAllProjects() {
    return service.getAllProjects();
}
```

## Expected status per HTTP method

| HTTP Method | Expected `@ResponseStatus`       |
|-------------|----------------------------------|
| GET         | `HttpStatus.OK` (200)            |
| POST        | `HttpStatus.CREATED` (201)       |
| PUT         | `HttpStatus.OK` (200)            |
| PATCH       | `HttpStatus.OK` (200)            |
| DELETE      | `HttpStatus.NO_CONTENT` (204)    |

These are defaults — deviate only when the use case genuinely requires a different status, but always declare it explicitly.

## Rationale

- Makes the contract of each endpoint immediately visible without reading the implementation
- Prevents accidental wrong status codes (e.g. returning `200` on resource creation instead of `201`)
- Serves as living documentation alongside the method signature
- Consistent with the rule of not using `ResponseEntity` — `@ResponseStatus` is the clean alternative for status declaration
