# Rule: @ControllerAdvice Methods Must Return ProblemDetail

## Guideline

All exception handler methods in `@RestControllerAdvice` classes must return `ProblemDetail` — never a custom error wrapper class or a plain `Map`.

`ProblemDetail` is the standard error response format defined in [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807) and natively supported by Spring 6+ / Spring Boot 3+.

```java
// ✅ Preferred
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ProjectNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ProblemDetail handleProjectNotFound(ProjectNotFoundException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        problem.setTitle("Project Not Found");
        problem.setType(URI.create("https://api.example.com/errors/project-not-found"));
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ProblemDetail handleValidationErrors(MethodArgumentNotValidException ex) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
        problem.setTitle("Validation Error");
        problem.setProperty("errors", ex.getBindingResult().getFieldErrors().stream()
            .map(e -> e.getField() + ": " + e.getDefaultMessage())
            .toList());
        return problem;
    }
}

// ❌ Avoid — custom error wrapper
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ProjectNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleProjectNotFound(ProjectNotFoundException ex) {
        return ResponseEntity.status(404).body(new ErrorResponse("Project Not Found", ex.getMessage()));
    }
}

// ❌ Avoid — plain Map
@ExceptionHandler(ProjectNotFoundException.class)
public ResponseEntity<Map<String, String>> handleProjectNotFound(ProjectNotFoundException ex) {
    return ResponseEntity.status(404).body(Map.of("error", ex.getMessage()));
}
```

## ProblemDetail standard fields

| Field | Description |
|-------|-------------|
| `type` | URI identifying the error type |
| `title` | Short human-readable summary |
| `status` | HTTP status code |
| `detail` | Specific explanation for this occurrence |
| `instance` | URI of the specific request that caused the error |

## Adding custom properties

Use `setProperty()` to extend ProblemDetail with extra fields without breaking the standard contract:

```java
problem.setProperty("errors", listOfValidationErrors);
problem.setProperty("timestamp", Instant.now());
problem.setProperty("traceId", MDC.get("traceId"));
```

## Example response payload

```json
{
  "type": "https://api.example.com/errors/project-not-found",
  "title": "Project Not Found",
  "status": 404,
  "detail": "Project with id 42 does not exist",
  "instance": "/api/projects/42",
  "timestamp": "2024-11-01T10:15:30Z"
}
```

## Rationale

- **RFC 7807 compliant** — standardized contract that API consumers can rely on
- **Natively supported** — no extra dependencies, built into Spring 6+ / Spring Boot 3+
- **Extensible** — `setProperty()` allows extra fields without breaking the standard structure
- **Eliminates custom error classes** — no need for `ErrorResponse`, `ApiError`, `ErrorWrapper`, etc.
- **Consistent** — every error from every endpoint looks the same
